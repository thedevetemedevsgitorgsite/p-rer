/**
 * Cloudflare Worker: Server-side OG/Twitter meta + schema.org injection
 * for /p?id=... product pages on DevTemple.
 *
 * Bind this worker to: https://devtem.org/p*
 * Env Vars:
 *   SUPABASE_URL
 *   SUPABASE_ANON_KEY
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. Only process product detail page requests
    if (url.pathname !== '/p') {
      return fetch(request);
    }

    const productId = url.searchParams.get('id');
    const originResponse = await fetch(request);

    // 2. Early return if missing ID or response isn't HTML
    const contentType = originResponse.headers.get('content-type') || '';
    if (!productId || !contentType.includes('text/html')) {
      return originResponse;
    }

    try {
      const { SUPABASE_URL, SUPABASE_ANON_KEY } = env;

      const cache = caches.default;
      const cacheKey = new Request(`https://cache.internal/og-meta/${productId}`);

      let product = null;
      const cached = await cache.match(cacheKey);

      // Safe Cache Extraction (Prevents "Unexpected end of JSON input" errors)
      if (cached) {
        try {
          product = await cached.json();
        } catch (_) {
          product = null; // Cache hit was corrupted/empty; fall back to API query
        }
      }

      // Fetch from Supabase if not cached
      if (!product) {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/posts?id=eq.${encodeURIComponent(productId)}` +
            `&select=id,name,description,price,cover,created_at,labels`,
          {
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            },
          }
        );

        if (!res.ok) return originResponse;

        const rows = await res.json();
        product = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
        if (!product) return originResponse;

        // Cache for 15 minutes
        const cacheResponse = new Response(JSON.stringify(product), {
          headers: {
            'content-type': 'application/json',
            'cache-control': 'max-age=900',
          },
        });
        ctx.waitUntil(cache.put(cacheKey, cacheResponse));
      }

      // Do not preview hidden/private products
      const visibility = product.labels?.visibility;
      if (visibility === 'hidden' || visibility === 'private') {
        return originResponse;
      }

      // Format Meta Content
      const title = `${product.name} — DevTemple`;
      const rawDesc = (product.description || '').replace(/\s+/g, ' ').trim();
      const desc = rawDesc.length > 160 ? rawDesc.slice(0, 157) + '...' : rawDesc;
      const image = product.cover || 'https://devtem.org/assets/images/og.jpg';
      const pageUrl = `https://devtem.org/p?id=${product.id}`;
      const isFree = !product.price || product.price === 0;

      // Build Schema.org Structured Data
      const schema = {
        '@context': 'https://schema.org/',
        '@type': 'Product',
        name: product.name,
        description: desc,
        image,
        offers: {
          '@type': 'Offer',
          url: pageUrl,
          priceCurrency: 'NGN',
          price: isFree ? 0 : product.price,
          availability: 'https://schema.org/InStock',
        },
      };

      // Escape angle brackets so JSON doesn't break HTML parsing
      const safeJsonLd = JSON.stringify(schema).replace(/</g, '\\u003c');

      // Flags to avoid duplicate tags
      let hasOgUrl = false;
      let hasCanonical = false;

      const rewriter = new HTMLRewriter()
        .on('title#meta-title', {
          element(el) { el.setInnerContent(title); },
        })
        .on('meta#meta-description', {
          element(el) { el.setAttribute('content', desc); },
        })
        .on('meta#og-title', {
          element(el) { el.setAttribute('content', title); },
        })
        .on('meta#og-description', {
          element(el) { el.setAttribute('content', desc); },
        })
        .on('meta#og-image', {
          element(el) { el.setAttribute('content', image); },
        })
        .on('meta[property="og:url"]', {
          element(el) {
            hasOgUrl = true;
            el.setAttribute('content', pageUrl);
          },
        })
        .on('meta#twitter-title', {
          element(el) { el.setAttribute('content', title); },
        })
        .on('meta#twitter-description', {
          element(el) { el.setAttribute('content', desc); },
        })
        .on('meta#twitter-image', {
          element(el) { el.setAttribute('content', image); },
        })
        .on('link[rel="canonical"]', {
          element(el) {
            hasCanonical = true;
            el.setAttribute('href', pageUrl);
          },
        })
        .on('head', {
          element(el) {
            // Append og:url & canonical ONLY if missing from origin template
            if (!hasOgUrl) {
              el.append(`<meta property="og:url" content="${pageUrl}">`, { html: true });
            }
            if (!hasCanonical) {
              el.append(`<link rel="canonical" href="${pageUrl}">`, { html: true });
            }
            // Append JSON-LD Structured Data
            el.append(`<script type="application/ld+json">${safeJsonLd}</script>`, { html: true });
          },
        });

      return rewriter.transform(originResponse);
    } catch (err) {
      // Graceful fallback to origin HTML on failure
      return originResponse;
    }
  },
};


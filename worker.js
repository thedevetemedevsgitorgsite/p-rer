// Cloudflare Worker: Edge Meta Injector & Caching for DevTemple Products

const ORIGIN_URL = "https://your-upstream-origin.com"; // e.g., Netlify/Vercel deployment URL or origin host

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const productId = url.searchParams.get("id");

    // If no product ID is present, pass directly through to origin
    if (!productId) {
      return fetch(request);
    }

    // Initialize Cloudflare Default Cache
    const cache = caches.default;
    const cacheKey = new Request(url.toString(), request);
    let response = await cache.match(cacheKey);

    if (response) {
      return response;
    }

    try {
      // Access Supabase Credentials via Environment Variables (env)
      const supabaseUrl = env.SUPABASE_URL;
      const supabaseKey = env.SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables.");
      }

      // 1. Fetch Product Data from Supabase REST API
      const dbUrl = `${supabaseUrl}/rest/v1/posts?id=eq.${encodeURIComponent(productId)}&select=id,name,description,price,cover,user_id,created_at,sponsored,labels`;
      const dbRes = await fetch(dbUrl, {
        headers: {
          "apikey": supabaseKey,
          "Authorization": `Bearer ${supabaseKey}`,
          "Accept": "application/json"
        }
      });

      if (!dbRes.ok) {
        throw new Error(`Supabase query failed with status: ${dbRes.status}`);
      }

      const products = await dbRes.json();
      const product = products[0];

      // 2. Fetch Base HTML from Origin (Netlify/Server)
      const originRes = await fetch(`${ORIGIN_URL}${url.pathname}${url.search}`, {
        headers: request.headers
      });

      if (!originRes.ok) {
        return originRes;
      }

      // If product doesn't exist, return original HTML unmodified
      if (!product) {
        return originRes;
      }

      // 3. Prepare Metadata & Schema Data
      const cleanTitle = escapeHtml(product.name || "Digital Asset");
      const cleanDesc = escapeHtml((product.description || "").slice(0, 160).replace(/\n/g, " "));
      const coverImg = product.cover || "https://devtem.org/assets/images/og.jpg";
      const isFree = product.price === 0 || product.price === null;
      const formattedPrice = isFree ? "0.00" : Number(product.price).toFixed(2);
      const productUrl = `https://devtem.org/p?id=${product.id}`;

      // Schema.org Product Payload
      const jsonLdPayload = {
        "@context": "https://schema.org/",
        "@type": "Product",
        "name": product.name,
        "image": [coverImg],
        "description": product.description ? product.description.slice(0, 300) : "",
        "sku": product.id,
        "offers": {
          "@type": "Offer",
          "url": productUrl,
          "priceCurrency": "NGN",
          "price": formattedPrice,
          "availability": "https://schema.org/InStock",
          "itemCondition": "https://schema.org/NewCondition"
        }
      };

      // 4. Transform HTML via HTMLRewriter at Edge
      const rewriter = new HTMLRewriter()
        .on("title#meta-title", { element(e) { e.setInnerContent(`${cleanTitle} — DevTemple`); } })
        .on("meta#meta-description", { element(e) { e.setAttribute("content", cleanDesc); } })
        .on("meta#og-title", { element(e) { e.setAttribute("content", cleanTitle); } })
        .on("meta#og-description", { element(e) { e.setAttribute("content", cleanDesc); } })
        .on("meta#og-image", { element(e) { e.setAttribute("content", coverImg); } })
        .on("meta[property='og:url']", { element(e) { e.setAttribute("content", productUrl); } })
        .on("meta#twitter-title", { element(e) { e.setAttribute("content", cleanTitle); } })
        .on("meta#twitter-description", { element(e) { e.setAttribute("content", cleanDesc); } })
        .on("meta#twitter-image", { element(e) { e.setAttribute("content", coverImg); } })
        .on("head", {
          element(e) {
            e.append(`<script type="application/ld+json">${JSON.stringify(jsonLdPayload)}</script>`, { html: true });
          }
        });

      const modifiedRes = rewriter.transform(originRes);
      
      response = new Response(modifiedRes.body, modifiedRes);
      response.headers.set("Content-Type", "text/html; charset=UTF-8");
      response.headers.set("Cache-Control", "public, max-age=900, s-maxage=900");

      ctx.waitUntil(cache.put(cacheKey, response.clone()));

      return response;

    } catch (err) {
      console.error("Worker Edge Execution Error:", err);
      // Fallback: Return standard origin HTML on errors/limits
      return fetch(request);
    }
  }
};

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


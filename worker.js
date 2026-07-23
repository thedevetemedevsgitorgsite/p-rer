export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const targetUrl = `https://devtem.org${url.pathname}${url.search}`;
    const response = await fetch(targetUrl, { headers: request.headers });
    
    // ── Bot detection ────────────────────────────────────────────────────────
    const ua = request.headers.get("user-agent") || "";
    const isBot = /whatsapp|telegrambot|facebookexternalhit|twitterbot|slackbot|linkedinbot|discordbot|pinterest/i.test(ua);
    if (!isBot) return response;
    
    // ── Helpers ──────────────────────────────────────────────────────────────
    const BASE = "https://fgglquyepbbzrdzmkpfd.supabase.co/rest/v1";
    const API_KEY = "your supabase apiKey";
    
    const headers = {
      apikey: API_KEY,
      Authorization: `Bearer ${API_KEY}`
    };
    
    // Helper to safely inject meta tags (same as before)
    function injectMeta(html, tag, value) {
      const safe = value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      if (tag === 'title') {
        return html.replace(/<title>[^<]*<\/title>/i, `<title>${safe}</title>`);
      }
      const attr = tag.startsWith('twitter:') ? `name="${tag}"` : `property="${tag}"`;
      const regex = new RegExp(`<meta ${attr} content="[^"]*"\\s*/?>`, 'i');
      const newTag = `<meta ${attr} content="${safe}">`;
      if (regex.test(html)) {
        return html.replace(regex, newTag);
      } else {
        return html.replace('</head>', `  ${newTag}\n</head>`);
      }
    }
    
    // ── PRODUCT PAGE (`/p?id=...`) ──────────────────────────────────────────
    if (url.pathname === '/p' && url.searchParams.has('id')) {
      const id = url.searchParams.get('id');
      try {
        const postRes = await fetch(`${BASE}/posts?id=eq.${id}&select=*`, { headers });
        const posts = await postRes.json();
        if (!posts?.length) return response;
        const post = posts[0];
        
        const profRes = await fetch(`${BASE}/profiles?id=eq.${post.user_id}&select=*`, { headers });
        const profiles = await profRes.json();
        const profile = profiles?.[0] || {};
        
        const isSponsored = post.sponsored !== 'n';
        const isFree = !isSponsored && (!post.price || post.price === 0);
        const isAI = post.labels?.ailabel === true;
        
        const title = `${post.name} — DevTemple`;
        const priceStr = isSponsored ? 'Sponsored' :
          isFree ? 'Free' :
          `₦${Number(post.price).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        const authorLine = profile.full_name ?
          `By ${profile.full_name}${profile.username ? ` (@${profile.username})` : ''}` :
          '';
        const desc = [
          post.description?.slice(0, 130).replace(/\n/g, ' '),
          authorLine,
          `${priceStr} · ${post.sales || 0} sold · ${post.star || 0} likes`,
          isAI ? 'Includes AI content' : '',
        ].filter(Boolean).join(' | ');
        
        const image = post.cover || 'https://devtem.org/assets/images/og.jpg';
        const pageUrl = `https://devtem.org/p?id=${post.id}`;
        
        let html = await response.text();
        html = injectMeta(html, 'title', title);
        html = injectMeta(html, 'og:title', title);
        html = injectMeta(html, 'og:description', desc);
        html = injectMeta(html, 'og:image', image);
        html = injectMeta(html, 'og:image:width', '1200');
        html = injectMeta(html, 'og:image:height', '630');
        html = injectMeta(html, 'og:url', pageUrl);
        html = injectMeta(html, 'og:type', 'product');
        html = injectMeta(html, 'og:site_name', 'DevTemple');
        html = injectMeta(html, 'twitter:card', 'summary_large_image');
        html = injectMeta(html, 'twitter:title', title);
        html = injectMeta(html, 'twitter:description', desc);
        html = injectMeta(html, 'twitter:image', image);
        if (!isSponsored) {
          html = injectMeta(html, 'product:price:amount', String(post.price || 0));
          html = injectMeta(html, 'product:price:currency', 'NGN');
        }
        
        const newHeaders = new Headers(response.headers);
        newHeaders.delete('content-length');
        newHeaders.delete('content-encoding');
        newHeaders.set('content-type', 'text/html; charset=utf-8');
        return new Response(html, { status: response.status, headers: newHeaders });
        
      } catch (err) {
        console.error('Product OG error:', err);
        return response;
      }
    }
    
    // ── PROFILE PAGE (`/s?s=...`) ──────────────────────────────────────────
    if (url.pathname === '/s' && url.searchParams.has('s')) {
      let userId = url.searchParams.get('s');
      try {
        // Resolve username to ID if needed
        let resolvedId = userId;
        if (userId.startsWith('@')) {
          const username = userId.slice(1);
          // Check profiles
          const profLookup = await fetch(`${BASE}/profiles?username=eq.${username}&select=id`, { headers });
          const profData = await profLookup.json();
          if (profData?.length) {
            resolvedId = profData[0].id;
          } else {
            // Check username_history
            const histLookup = await fetch(`${BASE}/username_history?username=eq.${username}&select=user_id&order=changed_at.desc&limit=1`, { headers });
            const histData = await histLookup.json();
            if (histData?.length) resolvedId = histData[0].user_id;
            else return response; // user not found
          }
        }
        
        // Fetch profile
        const profRes = await fetch(`${BASE}/profiles?id=eq.${resolvedId}&select=*`, { headers });
        const profiles = await profRes.json();
        if (!profiles?.length) return response;
        const profile = profiles[0];
        
        // Fetch stats from posts
        const postsRes = await fetch(`${BASE}/posts?user_id=eq.${resolvedId}&select=sales,star`, { headers });
        const posts = await postsRes.json() || [];
        const totalPosts = posts.length;
        const totalSales = posts.reduce((s, p) => s + (p.sales || 0), 0);
        const totalLikes = posts.reduce((s, p) => s + (p.star || 0), 0);
        
        // Build OG values
        const displayName = profile.full_name || profile.username || 'Creator';
        const title = `${displayName} — DevTemple`;
        const bio = profile.bio ? `${profile.bio.slice(0, 120)}` : 'Explore creator profile on DevTemple';
        const statLine = `${totalPosts} products · ${totalSales} sales · ${totalLikes} likes`;
        const desc = `${bio} | ${statLine}`;
        const image = profile.photo_url || 'https://devtem.org/assets/images/og.jpg';
        const pageUrl = `https://devtem.org/s?s=${resolvedId}`;
        
        let html = await response.text();
        html = injectMeta(html, 'title', title);
        html = injectMeta(html, 'og:title', title);
        html = injectMeta(html, 'og:description', desc);
        html = injectMeta(html, 'og:image', image);
        html = injectMeta(html, 'og:image:width', '1200');
        html = injectMeta(html, 'og:image:height', '630');
        html = injectMeta(html, 'og:url', pageUrl);
        html = injectMeta(html, 'og:type', 'profile');
        html = injectMeta(html, 'og:site_name', 'DevTemple');
        html = injectMeta(html, 'twitter:card', 'summary_large_image');
        html = injectMeta(html, 'twitter:title', title);
        html = injectMeta(html, 'twitter:description', desc);
        html = injectMeta(html, 'twitter:image', image);
        
        const newHeaders = new Headers(response.headers);
        newHeaders.delete('content-length');
        newHeaders.delete('content-encoding');
        newHeaders.set('content-type', 'text/html; charset=utf-8');
        return new Response(html, { status: response.status, headers: newHeaders });
        
      } catch (err) {
        console.error('Profile OG error:', err);
        return response;
      }
    }
    
    // ── Everything else: pass through ──────────────────────────────────────
    return response;
  }
};

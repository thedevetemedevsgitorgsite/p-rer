export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const id  = url.searchParams.get("id");

    // Pass through everything that isn't a product page
    const targetUrl = `https://devtem.org${url.pathname}${url.search}`;
    const response  = await fetch(targetUrl, { headers: request.headers });

    if (!id) return response;

    // Only intercept known bots — humans get the real page instantly
    const ua    = request.headers.get("user-agent") || "";
    const isBot = /whatsapp|telegrambot|facebookexternalhit|twitterbot|slackbot|linkedinbot|discordbot|pinterest/i.test(ua);

    if (!isBot) return response;

    try {
      const BASE    = "https://fgglquyepbbzrdzmkpfd.supabase.co/rest/v1";
      const API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnZ2xxdXllcGJienJkem1rcGZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkwOTkyMjksImV4cCI6MjA3NDY3NTIyOX0.mT03kocvd2gMLu6y4VeYXQqcBKUPD5DKtku6HrRO7cA"; // set in Worker secrets

      // 1. Fetch post
      const postRes = await fetch(
        `${BASE}/posts?id=eq.${id}&select=*`,
        { headers: { apikey: API_KEY, Authorization: `Bearer ${API_KEY}` } }
      );
      const posts = await postRes.json();
      if (!posts?.length) return response;
      const post = posts[0];

      // 2. Fetch author profile
      const profRes = await fetch(
        `${BASE}/profiles?id=eq.${post.user_id}&select=*`,
        { headers: { apikey: API_KEY, Authorization: `Bearer ${API_KEY}` } }
      );
      const profiles = await profRes.json();
      const profile  = profiles?.[0] || {};

      // 3. Build OG values
      const isSponsored = post.sponsored !== 'n';
      const isFree      = !isSponsored && (!post.price || post.price === 0);
      const isAI        = post.labels?.ailabel === true;

      const title = `${post.name} — DevTemple`;

      const priceStr = isSponsored ? 'Sponsored'
        : isFree ? 'Free'
        : `₦${Number(post.price).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

      const authorLine = profile.full_name
        ? `By ${profile.full_name}${profile.username ? ` (@${profile.username})` : ''}`
        : '';

      const desc = [
        post.description?.slice(0, 130).replace(/\n/g, ' '),
        authorLine,
        `${priceStr} · ${post.sales || 0} sold · ${post.star || 0} likes`,
        isAI ? 'Includes AI content' : '',
      ].filter(Boolean).join(' | ');

      const image   = post.cover || 'https://devtem.org/assets/images/og.jpg';
      const pageUrl = `https://devtem.org/p?id=${post.id}`;

      // 4. Inject into HTML
      let html = await response.text();

      const set = (tag, val) => {
        // Escape for HTML attribute
        const safe = val.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

        // Replace <title>
        if (tag === 'title') {
          html = html.replace(/<title>[^<]*<\/title>/i, `<title>${safe}</title>`);
          return;
        }
        // Replace or inject og/twitter meta
        const attr  = tag.startsWith('twitter:') ? `name="${tag}"` : `property="${tag}"`;
        const regex = new RegExp(`<meta ${attr} content="[^"]*"\\s*/?>`, 'i');
        const newTag = `<meta ${attr} content="${safe}">`;
        if (regex.test(html)) {
          html = html.replace(regex, newTag);
        } else {
          // inject before </head>
          html = html.replace('</head>', `  ${newTag}\n</head>`);
        }
      };

      set('title',               title);
      set('og:title',            title);
      set('og:description',      desc);
      set('og:image',            image);
      set('og:image:width',      '1200');
      set('og:image:height',     '630');
      set('og:url',              pageUrl);
      set('og:type',             'product');
      set('og:site_name',        'DevTemple');
      set('twitter:card',        'summary_large_image');
      set('twitter:title',       title);
      set('twitter:description', desc);
      set('twitter:image',       image);

      // Product-specific (used by some crawlers)
      if (!isSponsored) {
        set('product:price:amount',   String(post.price || 0));
        set('product:price:currency', 'NGN');
      }

      const newHeaders = new Headers(response.headers);
newHeaders.delete('content-length');
newHeaders.delete('content-encoding');    // or set to 'identity'
newHeaders.set('content-type', 'text/html; charset=utf-8');

return new Response(html, {
  status: response.status,
  headers: newHeaders
});

    } catch (err) {
    console.log("I log this: ", err)
      // Never break the real page
      return response;
    }
  }
};


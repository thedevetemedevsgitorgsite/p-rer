// Cloudflare Worker: Direct HTML Rendering with Hydration & Caching for DevTemple

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const productId = url.searchParams.get("id");

    // Initialize Cloudflare Default Cache
    const cache = caches.default;
    const cacheKey = new Request(url.toString(), request);
    let cachedResponse = await cache.match(cacheKey);

    if (cachedResponse) {
      return cachedResponse;
    }

    // Access Supabase Credentials via Environment Variables
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_ANON_KEY;

    let product = null;

    // 1. Fetch Product Data from Supabase if Product ID exists
    if (productId && supabaseUrl && supabaseKey) {
      try {
        const dbUrl = `${supabaseUrl}/rest/v1/posts?id=eq.${encodeURIComponent(productId)}&select=id,name,description,price,cover,user_id,created_at,sponsored,labels`;
        const dbRes = await fetch(dbUrl, {
          headers: {
            "apikey": supabaseKey,
            "Authorization": `Bearer ${supabaseKey}`,
            "Accept": "application/json"
          }
        });

        if (dbRes.ok) {
          const products = await dbRes.json();
          product = products[0] || null;
        }
      } catch (err) {
        console.error("Supabase fetch error:", err);
      }
    }

    // 2. Fallback Values (If product is missing or fetch fails)
    const cleanTitle = product ? escapeHtml(product.name || "Digital Asset") : "DevTemple Product Overview | Premium Digital Assets";
    const cleanDesc = product 
      ? escapeHtml((product.description || "").slice(0, 160).replace(/\n/g, " "))
      : "Explore premium digital assets, creative resources, templates, and professional tools on DevTemple.";
    const coverImg = (product && product.cover) ? product.cover : "https://devtem.org/assets/images/og.jpg";
    const productUrl = productId ? `https://devtem.org/p?id=${encodeURIComponent(productId)}` : "https://devtem.org/p";
    
    const isFree = product ? (product.price === 0 || product.price === null) : false;
    const formattedPrice = product ? (isFree ? "0.00" : Number(product.price).toFixed(2)) : "0.00";

    // 3. Schema.org JSON-LD Payload
    const jsonLdPayload = product ? {
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
    } : null;

    // 4. Construct Complete HTML Document directly
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <!-- Primary SEO -->
  <title id="meta-title">${cleanTitle} — DevTemple</title>
  <meta name="title" content="${cleanTitle} — DevTemple">
  <meta name="description" id="meta-description" content="${cleanDesc}">
  <meta name="keywords" content="DevTemple, premium digital assets, creative resources, marketing tools, templates, UI kits, code snippets, web templates, developer marketplace">
  <meta name="author" content="DevTemple">
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
  <meta name="theme-color" content="#0066ff">
  <meta name="color-scheme" content="dark light">

  <!-- Canonical -->
  <link rel="canonical" href="${productUrl}">

  <!-- Favicon -->
  <link rel="icon" type="image/png" href="/assets/images/logo.png">
  <link rel="apple-touch-icon" href="/assets/images/logo.png">

  <!-- Open Graph / Meta / WhatsApp -->
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="DevTemple">
  <meta property="og:title" id="og-title" content="${cleanTitle}">
  <meta property="og:description" id="og-description" content="${cleanDesc}">
  <meta property="og:url" content="${productUrl}">
  <meta property="og:image" id="og-image" content="${coverImg}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:locale" content="en_US">

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" id="twitter-title" content="${cleanTitle}">
  <meta name="twitter:description" id="twitter-description" content="${cleanDesc}">
  <meta name="twitter:image" id="twitter-image" content="${coverImg}">

  ${jsonLdPayload ? `<script type="application/ld+json">${JSON.stringify(jsonLdPayload)}</script>` : ''}

  <!-- Styles -->
  <link rel="stylesheet" href="/assets/styles/index.css">
  <link rel="stylesheet" href="/assets/styles/blog.css">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Audiowide">
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">

  <style>
    .pd-wrap { max-width: 1200px; margin: 0 auto; padding: 20px 16px 60px; }
    .pd-breadcrumb { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-dim, #888); margin-bottom: 20px; flex-wrap: wrap; }
    .pd-breadcrumb a { color: var(--primary-color, #06f); text-decoration: none; }
    .pd-breadcrumb .sep { color: var(--text-dim, #aaa); }
    .pd-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 40px; }
    @media (max-width: 768px) { .pd-grid { grid-template-columns: 1fr; gap: 20px; } }
    .pd-gallery { position: relative; }
    .pd-main-image { position: relative; width: 100%; aspect-ratio: 4/3; background: var(--card-bg, #f0f4ff); border-radius: 16px; overflow: hidden; border: 1px solid var(--border-color, #e5e7eb); }
    .pd-main-image img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.3s ease; }
    .pd-badges { position: absolute; top: 12px; left: 12px; display: flex; gap: 6px; flex-wrap: wrap; z-index: 2; }
    .pd-badge { padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
    .pd-badge.sponsored { background: linear-gradient(135deg, #f59e0b, #d97706); color: #fff; }
    .pd-badge.free { background: #22c55e; color: #fff; }
    .pd-badge.premium { background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: #fff; }
    .pd-badge.ai { background: linear-gradient(135deg, #06f, #0040cc); color: #fff; }
    .pd-badge.hidden-badge { background: #ef4444; color: #fff; }
    .pd-image-nav { display: flex; gap: 8px; margin-top: 12px; overflow-x: auto; padding: 4px 0; }
    .preview-btn { background: var(--primary-color, #06f); color: #ffffff; font-weight: 700; display: flex; justify-content: center; align-items: center; padding: 10px 12px; margin-bottom: 20px; border-radius: 10px; border: var(--main-border); cursor: pointer; }
    .pd-thumb { width: 80px; height: 60px; border-radius: 8px; object-fit: cover; cursor: pointer; border: 2px solid transparent; flex-shrink: 0; }
    .pd-thumb.active { border-color: var(--primary-color, #06f); }
    .pd-info { display: flex; flex-direction: column; gap: 16px; }
    .pd-title { font-size: clamp(22px, 3vw, 32px); font-weight: 700; color: var(--text-light, #111); margin: 0; line-height: 1.3; }
    .pd-meta-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; font-size: 13px; color: var(--text-dim, #777); }
    .pd-meta-row .pd-verified { display: inline-flex; align-items: center; gap: 4px; color: var(--primary-color, #06f); font-weight: 600; }
    .pd-meta-row .pd-category { background: var(--card-bg, #f0f4ff); padding: 2px 10px; border-radius: 12px; color: var(--primary-color, #06f); font-weight: 600; font-size: 12px; }
    .pd-rating { display: flex; align-items: center; gap: 6px; }
    .pd-stars { color: #f59e0b; font-size: 16px; letter-spacing: 1px; }
    .pd-price-box { background: var(--card-bg, #f8f9ff); border: 1px solid var(--border-color, #e5e7eb); border-radius: 12px; padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
    .pd-price { font-size: 28px; font-weight: 800; color: var(--primary-color, #06f); }
    .pd-actions { display: flex; gap: 10px; flex-wrap: wrap; }
    .pd-btn { padding: 10px 24px; border-radius: 10px; border: none; font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit; transition: all 0.2s; display: inline-flex; align-items: center; gap: 8px; }
    .pd-btn-primary { background: var(--primary-color, #06f); color: #fff; }
    .pd-btn-like { background: transparent; border: 1px solid var(--border-color, #e5e7eb); color: var(--text-dim, #888); padding: 10px 16px; }
    .pd-stats-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 12px; background: var(--card-bg, #f8f9ff); border: 1px solid var(--border-color, #e5e7eb); border-radius: 12px; padding: 16px; }
    .pd-stat { text-align: center; }
    .pd-stat-value { font-size: 20px; font-weight: 800; color: var(--text-light, #111); display: block; }
    .pd-stat-label { font-size: 12px; color: var(--text-dim, #888); }
    .pd-description { font-size: 15px; line-height: 1.8; color: var(--text-dim, #555); white-space: pre-wrap; word-break: break-word; }
    .pd-tabs { display: flex; border-bottom: 1px solid var(--border-color, #e5e7eb); margin: 24px 0; gap: 0; overflow-x: auto; }
    .pd-tab { padding: 12px 20px; font-size: 14px; font-weight: 600; color: var(--text-dim, #888); border: none; background: none; cursor: pointer; font-family: inherit; border-bottom: 2px solid transparent; margin-bottom: -1px; white-space: nowrap; }
    .pd-tab.active { color: var(--primary-color, #06f); border-bottom-color: var(--primary-color, #06f); }
    .pd-tab-panel { display: none; }
    .pd-tab-panel.active { display: block; }
    .pd-license { background: var(--card-bg, #f8f9ff); border: 1px solid var(--border-color, #e5e7eb); border-radius: 12px; padding: 20px; margin-top: 16px; }
    .pd-author-card { display: flex; align-items: center; gap: 16px; padding: 16px; background: var(--card-bg, #f8f9ff); border: 1px solid var(--border-color, #e5e7eb); border-radius: 12px; text-decoration: none; color: inherit; }
    .pd-author-avatar { width: 56px; height: 56px; border-radius: 50%; object-fit: cover; }
    .pd-related-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; margin-top: 16px; }
    .pd-related-card { background: var(--card-bg, #f8f9ff); border: 1px solid var(--border-color, #e5e7eb); border-radius: 12px; overflow: hidden; text-decoration: none; color: inherit; }
    .loading-post button { width: 40px; height: 40px; border: 6px solid #06f; border-radius: 10px; animation: morph 1.4s ease-in-out infinite; background: transparent !important; }
    @keyframes morph { 0% { border-radius: 40px 10px 10px 10px; } 50% { border-radius: 10px 10px 40px 10px; } 100% { border-radius: 40px 10px 10px 10px; } }
  </style>
</head>
<body>

<section class="top-ad">
  <div class="text-container"><a href="//devtem.org/dashboard#/reward/">🎁 Start earning today — view rewards</a></div>
</section>

<section class="top-menu">
  <div class="top-btns">
    <div class="top-left">
      <button class="top-btn toggle-menu">
        <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>
      <h3 class="app-name">DevTemple</h3>
    </div>
    <button class="top-btn add-post" onclick="window.location.href='/dashboard#/pen/'">
      <svg xmlns="http://www.w3.org/2000/svg" width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><polyline points="7 9 12 4 17 9"/><line x1="12" y1="4" x2="12" y2="16"/>
      </svg>
    </button>
    <button class="top-btn cart" onclick="window.location.href='/cart'">
      <svg width="28" height="25" viewBox="0 0 24 24" fill="currentColor">
        <path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/>
      </svg>
    </button>
    <button class="top-btn gift" onclick="window.location.href='/dashboard#/reward/'">
      <svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="8" width="18" height="13" rx="2" ry="2"/><path d="M12 8v13"/><path d="M3 12h18"/><path d="M12 8c-1.5-2-4-4-6-2s1.5 4 6 2z"/><path d="M12 8c1.5-2 4-4 6-2s-1.5 4-6 2z"/>
      </svg>
    </button>
    <button class="top-btn user" onclick="window.location.href='/dashboard#/user/'">
      <svg class="svg-icon" viewBox="0 0 448 512" width="20" height="20">
        <path fill="currentColor" d="M224 256c70.7 0 128-57.3 128-128S294.7 0 224 0 96 57.3 96 128s57.3 128 128 128zm89.6 32h-16.7c-22.2 10.2-46.9 16-72.9 16s-50.6-5.8-72.9-16h-16.7C60.2 288 0 348.2 0 422.4V464c0 26.5 21.5 48 48 48h352c26.5 0 48-21.5 48-48v-41.6c0-74.2-60.2-134.4-134.4-134.4z"/>
      </svg>
    </button>
  </div>
</section>

<main>
  <div class="pd-wrap">
    <nav class="pd-breadcrumb" id="pd-breadcrumb">
      <a href="/">Home</a><span class="sep">›</span>
      <a href="/home">Templates</a><span class="sep">›</span>
      <span id="breadcrumb-product">${cleanTitle}</span>
    </nav>

    <div class="pd-spinner" id="pd-loading">
      <div class="loading-post"><button></button></div>
    </div>

    <div id="pd-content" style="display:none;">
      <div class="pd-grid">
        <div class="pd-gallery">
          <div class="pd-main-image" id="pd-main-image">
            <img id="pd-main-img" src="${coverImg}" alt="Product image">
            <div class="pd-badges" id="pd-badges"></div>
          </div>
          <div class="pd-image-nav" id="pd-image-nav"></div>
        </div>

        <div class="pd-info">
          <h1 class="pd-title" id="pd-title">${cleanTitle}</h1>
          <div class="pd-meta-row">
            <span id="pd-category">Loading...</span>
            <span id="pd-date">Loading...</span>
            <span class="pd-verified" id="pd-verified" style="display:none;">Verified Creator</span>
            <span class="pd-rating">
              <span class="pd-stars" id="pd-stars">★★★★★</span>
              <span class="pd-rating-count" id="pd-rating-count">(0 ratings)</span>
            </span>
          </div>

          <div class="pd-description" id="pd-description">${cleanDesc}</div>

          <div class="pd-price-box">
            <div>
              <span class="pd-price" id="pd-price">₦${formattedPrice}</span>
            </div>
            <div class="pd-actions">
              <button class="pd-btn pd-btn-primary" id="pd-add-to-cart">Add to Cart</button>
              <button class="pd-btn pd-btn-like" id="pd-like-btn">❤️ <span id="pd-like-count">0</span></button>
            </div>
          </div>

          <div class="pd-stats-row">
            <div class="pd-stat"><span class="pd-stat-value" id="pd-stat-sales">0</span><span class="pd-stat-label">Sales</span></div>
            <div class="pd-stat"><span class="pd-stat-value" id="pd-stat-likes">0</span><span class="pd-stat-label">Likes</span></div>
            <div class="pd-stat"><span class="pd-stat-value" id="pd-stat-views">?</span><span class="pd-stat-label">Views</span></div>
            <div class="pd-stat"><span class="pd-stat-value" id="pd-stat-subscribers">0</span><span class="pd-stat-label">Subscribers</span></div>
          </div>
        </div>
      </div>

      <div class="pd-tabs">
        <button class="pd-tab active" data-tab="details">Details</button>
        <button class="pd-tab" data-tab="license">License</button>
        <button class="pd-tab" data-tab="author">Author</button>
        <button class="pd-tab" data-tab="related">Related</button>
      </div>

      <div class="pd-tab-panel active" id="tab-details">
        <div class="pd-description" id="pd-full-description">${cleanDesc}</div>
      </div>
      <div class="pd-tab-panel" id="tab-license">
        <div class="pd-license">
          <h4>DevTemple License Summary</h4>
          <p>Use for personal or commercial projects.</p>
        </div>
      </div>
      <div class="pd-tab-panel" id="tab-author">
        <a class="pd-author-card" id="pd-author-card" href="#">
          <img class="pd-author-avatar" id="pd-author-avatar" src="/assets/images/default.png" alt="Author avatar">
          <div class="pd-author-info">
            <div class="pd-author-name" id="pd-author-name">Loading...</div>
            <div class="pd-author-handle" id="pd-author-handle">@loading</div>
          </div>
        </a>
      </div>
      <div class="pd-tab-panel" id="tab-related">
        <div class="pd-related-grid" id="pd-related-grid">
          <p style="color:var(--text-dim,#888);grid-column:1/-1;text-align:center;padding:40px 0;">Loading related products...</p>
        </div>
      </div>
    </div>
  </div>
</main>

<div id="toast" class="toast" style="position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:12px 24px;border-radius:12px;background:#1a1a2e;color:#fff;font-size:14px;font-weight:600;z-index:2000;opacity:0;transition:opacity 0.3s ease;pointer-events:none;box-shadow:0 8px 32px rgba(0,0,0,0.3);"></div>

<footer class="footer">
  <div class="container">
    <div class="footer-bottom">
      <p>&copy; 2026 DevTemple. All Rights Reserved.</p>
      <div class="footer-bottom-links">
        <a href="/terms">Terms</a><span>•</span>
        <a href="/terms/privacy">Privacy</a><span>•</span>
        <a href="/faq">FAQ</a>
      </div>
    </div>
  </div>
</footer>

<script src="https://js.paystack.co/v1/inline.js"></script>
<script src="/assets/scripts/hero.js"></script>
<script src="/assets/scripts/main.js"></script>

<script type="importmap">{"imports":{"sb":"https://esm.sh/@supabase/supabase-js@2"}}</script>
<script type="module" src="/assets/scripts/p-.js"></script>

</body>
</html>`;

    // 5. Build Final Response & Save to Cloudflare Cache
    const response = new Response(htmlContent, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=UTF-8",
        "Cache-Control": "public, max-age=900, s-maxage=900"
      }
    });

    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  }
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


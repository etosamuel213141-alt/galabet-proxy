export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  const BASE_DOMAIN = "galabet1008.com";
  const ORIGIN = `https://www.${BASE_DOMAIN}`;

  const incomingUrl = new URL(request.url);
  
  // Subdomain routing
  let targetOrigin = ORIGIN;
  let targetPath = incomingUrl.pathname;
  
  const subdomainMatch = incomingUrl.pathname.match(/^\/__([a-z0-9_-]+)__(\/.*)?$/i);
  if (subdomainMatch) {
    const subdomain = subdomainMatch[1].replace(/_/g, '-');
    targetOrigin = `https://${subdomain}.${BASE_DOMAIN}`;
    targetPath = subdomainMatch[2] || '/';
  }
  
  const targetUrl = new URL(targetOrigin);
  targetUrl.pathname = targetPath;
  targetUrl.search = incomingUrl.search;

  // OPTIONS
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  const isBodyAllowed = !["GET", "HEAD"].includes(request.method);

  // Headers - Aggressive bypass
  const headers = new Headers();
  const targetHost = new URL(targetOrigin).hostname;
  
  headers.set("Host", targetHost);
  headers.set("Origin", targetOrigin);
  headers.set("Referer", `${targetOrigin}/`);
  headers.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
  headers.set("Accept", request.headers.get("Accept") || "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
  headers.set("Accept-Language", "tr-TR,tr;q=0.9,en-US;q=0.8");
  headers.set("Accept-Encoding", "gzip, deflate, br");
  
  // Turkish IP spoofing
  const turkishIPs = ["176.88.180.1", "185.94.188.1", "78.190.32.1", "31.145.0.1"];
  const randomIP = turkishIPs[Math.floor(Math.random() * turkishIPs.length)];
  headers.set("X-Forwarded-For", randomIP);
  headers.set("X-Real-IP", randomIP);
  
  const cookie = request.headers.get("Cookie");
  if (cookie) headers.set("Cookie", cookie);

  // Fetch
  const upstreamResponse = await fetch(targetUrl.toString(), {
    method: request.method,
    headers,
    body: isBodyAllowed ? request.body : null,
  });

  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.set("Access-Control-Allow-Origin", "*");
  responseHeaders.set("Access-Control-Allow-Methods", "*");
  responseHeaders.set("Access-Control-Allow-Headers", "*");
  responseHeaders.delete("content-security-policy");
  responseHeaders.delete("x-frame-options");

  const contentType = responseHeaders.get("content-type") || "";
  
  if (contentType.includes("text/html") || 
      contentType.includes("javascript") || 
      contentType.includes("application/json") ||
      contentType.includes("text/css")) {
    
    let text = await upstreamResponse.text();
    const proxy = incomingUrl.origin;
    
    // Subdomain rewriting
    text = text.replace(/https?:\/\/([a-z0-9-]+)\.galabet1008\.com/gi, (match, subdomain) => {
      if (subdomain === 'www') return proxy;
      const safeSub = subdomain.replace(/-/g, '_');
      return `${proxy}/__${safeSub}__`;
    });
    
    text = text.replace(/\/\/([a-z0-9-]+)\.galabet1008\.com/gi, (match, subdomain) => {
      if (subdomain === 'www') return proxy.replace(/^https?:/, '');
      const safeSub = subdomain.replace(/-/g, '_');
      return `${proxy.replace(/^https?:/, '')}/__${safeSub}__`;
    });
    
    text = text.replace(/https?:\/\/galabet1008\.com(?![a-z0-9\-.])/gi, proxy);
    text = text.replace(/\/\/galabet1008\.com(?![a-z0-9\-.])/gi, proxy.replace(/^https?:/, ''));
    
    if (contentType.includes("html")) {
      text = text.replace(/\b(href|src|action|data-src|data-bg|content)=(["'])\/(?!\/|_)/gi, `$1=$2${proxy}/`);
      text = text.replace(/url\((["']?)\/(?!\/|_)/gi, `url($1${proxy}/`);
      
      const interceptor = `
<script>
(function() {
  const PROXY = '${proxy}';
  function fixSubdomainUrl(url) {
    if (typeof url !== 'string') return url;
    return url.replace(/https?:\\/\\/([a-z0-9-]+)\\.galabet1008\\.com/gi, function(match, subdomain) {
      if (subdomain === 'www') return PROXY;
      var safeSub = subdomain.replace(/-/g, '_');
      return PROXY + '/__' + safeSub + '__';
    });
  }
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    return originalOpen.call(this, method, fixSubdomainUrl(url), ...args);
  };
  const originalFetch = window.fetch;
  window.fetch = function(url, ...args) {
    return originalFetch.call(this, fixSubdomainUrl(url), ...args);
  };
  const OriginalWebSocket = window.WebSocket;
  window.WebSocket = function(url, ...args) {
    var fixedUrl = fixSubdomainUrl(url).replace(/^http/, 'ws');
    return new OriginalWebSocket(fixedUrl, ...args);
  };
  console.log('[Galabet Vercel Proxy] Loaded');
})();
</script>`;
      
      if (text.includes('</head>')) {
        text = text.replace('</head>', interceptor + '</head>');
      } else if (text.includes('<body')) {
        text = text.replace('<body', interceptor + '<body');
      }
    }
    
    if (contentType.includes("css")) {
      text = text.replace(/url\((["']?)\/(?!\/|_)/gi, `url($1${proxy}/`);
    }
    
    return new Response(text, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}


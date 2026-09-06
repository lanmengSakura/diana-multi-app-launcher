export default {
  async fetch(request, env) {
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (headers.get("Content-Type")?.includes("text/html")) {
      // Cloudflare reads the response-header nonce for its bot-check bootstrap.
      // A meta-only CSP blocks that bootstrap; do not enable unsafe-inline scripts.
      // https://developers.cloudflare.com/cloudflare-challenges/challenge-types/javascript-detections/
      const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(18))));
      headers.set("Content-Security-Policy", [
        "default-src 'self'", `script-src 'self' 'nonce-${nonce}'`,
        "style-src 'self' 'unsafe-inline'", "img-src 'self' data:",
        "media-src 'self' blob:", "frame-src 'self'", "connect-src 'self'",
        "font-src 'self'", "object-src 'none'", "base-uri 'none'",
        "form-action 'none'", "frame-ancestors 'self'"
      ].join("; "));
      headers.set("Cache-Control", "private, no-store");
      headers.delete("Content-Length");
      headers.delete("ETag");
      const html = (await response.text()).replace(/<meta\s+http-equiv="Content-Security-Policy"[^>]*>/i, "");
      return new Response(request.method === "HEAD" ? null : html, { status: response.status, headers });
    }
    return new Response(response.body, { status: response.status, headers });
  }
};

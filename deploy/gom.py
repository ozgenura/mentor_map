# dist/ içindeki tüm dosyaları tek bir Worker modülüne gömer (statik dosya yükleme API'si kullanılmadan).
import base64, json, mimetypes, os, sys
kok = sys.argv[1]; out = sys.argv[2]
TIP = {".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8",
       ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml",
       ".png": "image/png", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8", ".woff2": "font/woff2"}
dosyalar = {}
for d, _, fs in os.walk(kok):
    for f in fs:
        p = os.path.join(d, f); yol = "/" + os.path.relpath(p, kok).replace(os.sep, "/")
        dosyalar[yol] = [TIP.get(os.path.splitext(f)[1], mimetypes.guess_type(f)[0] or "application/octet-stream"),
                         base64.b64encode(open(p, "rb").read()).decode()]
CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
       "font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data:; "
       "connect-src 'self' https://*.supabase.co wss://*.supabase.co; manifest-src 'self'; worker-src 'self'; "
       "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'")
js = f"""const CSP = {json.dumps(CSP)};
const F = {json.dumps(dosyalar)};
const cache = new Map();
function govde(yol) {{
  let b = cache.get(yol);
  if (!b) {{ const s = atob(F[yol][1]); b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); cache.set(yol, b); }}
  return b;
}}
export default {{
  async fetch(req) {{
    const url = new URL(req.url);
    let yol = decodeURIComponent(url.pathname);
    if (yol.endsWith("/")) yol += "index.html";
    if (!F[yol]) yol = "/index.html";
    const uzun = yol.startsWith("/assets/");
    if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method Not Allowed", {{ status: 405, headers: {{ allow: "GET, HEAD" }} }});
    return new Response(req.method === "HEAD" ? null : govde(yol), {{ headers: {{
      "content-type": F[yol][0],
      "cache-control": uzun ? "public, max-age=31536000, immutable" : "no-cache",
      "x-content-type-options": "nosniff",
      "content-security-policy": CSP,
      "x-frame-options": "DENY",
      "referrer-policy": "strict-origin-when-cross-origin",
      "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
      "strict-transport-security": "max-age=31536000; includeSubDomains",
      "cross-origin-opener-policy": "same-origin",
    }} }});
  }},
}};
"""
open(out, "w").write(js)
print(len(dosyalar), "dosya,", round(len(js)/1024), "KB")

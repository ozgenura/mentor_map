# Cloudflare demo deploy

Demo, `mentor-map-demo` Worker'ında çalışır (Zero Trust Access ile korumalı).
Statik dosyalar tek bir Worker modülüne gömülür; Cloudflare'in ayrı statik dosya yükleme API'si kullanılmaz.

```bash
cd web && cp ../path/demo-data-gercek.json public/demo-data.json   # gerçek veriyle demo
VITE_DEMO=1 npx vite build --outDir ../deploy/dist --emptyOutDir
cd ../deploy && python3 gom.py dist worker.js
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... npx wrangler deploy
```

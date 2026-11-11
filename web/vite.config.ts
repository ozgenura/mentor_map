import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "apple-touch-icon.png", "demo-data.json"],
      manifest: {
        name: "Mentor Map",
        short_name: "Mentor Map",
        description: "Eğitmen takvimi",
        lang: "tr",
        theme_color: "#0B3B2C",
        background_color: "#F7F3EF",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            // Program verisi: önce ağ, yoksa son başarılı yanıt (çevrimdışı açılış).
            urlPattern: ({ url, request }) => request.method === "GET" && url.pathname.startsWith("/rest/v1/"),
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-rest",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 50, maxAgeSeconds: 14 * 24 * 3600 },
              // Yalnızca 200 + JSON yanıtları önbelleğe yazılır; hata sayfası veri sanılmaz.
              cacheableResponse: { statuses: [200], headers: { "content-type": "application/json; charset=utf-8" } },
            },
          },
        ],
      },
    }),
  ],
  test: { include: ["src/**/*.test.ts"] },
});

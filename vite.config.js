import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icons/apple-touch-icon.png"],
      manifest: {
        name: "FurFriends — Pet Health Records",
        short_name: "FurFriends",
        description: "Profiles, medical history, vaccination records and vet documents for your cats and dogs.",
        theme_color: "#123d33",
        background_color: "#fbf8f3",
        display: "standalone",
        orientation: "portrait",
        start_url: "/#/app",
        scope: "/",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        importScripts: ["sw-notify.js"], // opens the app when a reminder notification is tapped
        // Precache the app shell, demo images and the assistant's answers so the app works offline.
        globPatterns: ["**/*.{js,css,html,svg,png,jpg,webmanifest}", "knowledge/index.json"],
        // The assistant's index (knowledge/index.json) is about 6 MB, 2.3 MB compressed as served.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        runtimeCaching: [
          {
            // The assistant's open-source search model and its runtime, downloaded the first time it's used.
            // Not the team's chat model (VITE_CHAT_MODEL, a repo named furfriends-…): it's about 380 MB and
            // Transformers.js already keeps its own copy, so caching it here too would double the space used.
            urlPattern: ({ url }) => /^https:\/\/(huggingface\.co|[a-z0-9-]+\.(aws\.)?cdn\.hf\.co|cdn\.jsdelivr\.net)\//i.test(url.href)
              && !/furfriends/i.test(url.pathname),
            handler: "CacheFirst",
            options: { cacheName: "assistant-model", expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 90 } },
          },
          {
            // The model's runtime (about 7 MB compressed), too big to precache with the app.
            urlPattern: /\/assets\/.*\.wasm$/,
            handler: "CacheFirst",
            options: { cacheName: "assistant-runtime", expiration: { maxEntries: 4 } },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: "CacheFirst",
            options: { cacheName: "google-fonts", expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  worker: { format: "es" },   // the assistant's model runs in a module worker (src/lib/embedWorker.js)
  server: { port: 5173 },
});

import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

/* For trying the Clinics page before the find-clinics edge function is deployed: run
   VITE_CLINICS_URL=/__clinics npm run dev, with TOMTOM_API_KEY in .env.local. Development only, no login check. */
const localClinics = (key) => ({
  name: "furfriends-local-clinics",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use("/__clinics", async (req, res) => {
      const send = (status, body) => { res.statusCode = status; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(body)); };
      if (!key) return send(503, { error: "Add TOMTOM_API_KEY to .env.local to try the clinic search locally." });
      let body = "";
      for await (const chunk of req) body += chunk;
      try {
        const { findClinics, geocode, memoryCache } = await server.ssrLoadModule("/supabase/functions/find-clinics/clinics.js");
        const cache = (globalThis.__clinicCache ||= memoryCache());
        const q = JSON.parse(body || "{}");
        let point = { lat: Number(q.lat), lon: Number(q.lon) }, place;
        if (!Number.isFinite(point.lat)) {
          const found = await geocode(String(q.address || ""), { key, cache });
          if (found.notFound) return send(404, { error: "We couldn't find that address. Try adding the barangay and city." });
          point = { lat: found.lat, lon: found.lon }; place = found.label;
        }
        send(200, { ...(await findClinics(point, { key, cache })), place, from: place ? point : undefined });
      } catch (e) { send(502, { error: e.message }); }
    });
  },
});

export default defineConfig(({ mode }) => ({
  plugins: [
    localClinics(loadEnv(mode, process.cwd(), "").TOMTOM_API_KEY),
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
            // Not the team's chat model (VITE_CHAT_MODEL, a repo named furfriends-…): it's about 430 MB and
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
  // In development, /api/ask goes to the AI function run locally: uvicorn api.ask:app --port 8001 (api/ask.py).
  server: { port: 5173, proxy: { "/api": "http://127.0.0.1:8001" } },
}));

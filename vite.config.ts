import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      includeAssets: [
        "hub-icon.svg",
        "hub-apple-touch-icon.png",
        "hiit-co-logo.png",
      ],
      manifest: {
        name: "HIIT Co. Hub",
        short_name: "HIIT Co. Hub",
        description: "Your training. Your progress. Your HIIT Co.",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        id: "/",
        scope: "/",
        icons: [
          {
            src: "/hub-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
          { src: "/hub-icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/hub-icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/hub-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        importScripts: ["/push-worker.js"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api(?:\/|$)/],
      },
    }),
  ],
});

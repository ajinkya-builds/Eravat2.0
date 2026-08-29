/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import legacy from "@vitejs/plugin-legacy";
import tailwindcss from "@tailwindcss/vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { VitePWA } from "vite-plugin-pwa";
import fs from "fs";
import path from "path";

// Auto-detect if google-services.json is missing to disable push notifications
const hasGoogleServices = fs.existsSync(path.resolve(process.cwd(), "android/app/google-services.json"));
if (!hasGoogleServices) {
  process.env.VITE_DISABLE_PUSH_NOTIFICATIONS = "true";
}

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_PATH || (process.env.NETLIFY === "true" ? "/" : "/Eravat2.0/"),
  define: {
    'import.meta.env.VITE_DISABLE_PUSH_NOTIFICATIONS': JSON.stringify(process.env.VITE_DISABLE_PUSH_NOTIFICATIONS || 'false')
  },
  // Android 7 WebView ≈ Chrome 53–69. Syntax is downleveled; plugin-legacy
  // emits a nomodule bundle for devices that never updated System WebView.
  build: {
    target: "es2018",
    cssTarget: "chrome69",
    modulePreload: { polyfill: true },
  },
  esbuild: {
    target: "es2018",
  },
  optimizeDeps: {
    esbuildOptions: { target: "es2018" },
  },
  plugins: [
    react(),
    legacy({
      targets: ["chrome >= 53", "android >= 7"],
      modernTargets: ["chrome >= 69", "android >= 7"],
      modernPolyfills: true,
      renderLegacyChunks: true,
      additionalLegacyPolyfills: ["regenerator-runtime/runtime"],
    }),
    tailwindcss(),
    nodePolyfills(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "elephant-logo.png",
        "elephant-favicon.svg",
        "apple-touch-icon.png",
        "masked-icon.svg",
      ],
      manifest: {
        name: "Eravat 2.0",
        short_name: "Eravat",
        description: "Elephant Monitoring Progressive Web App",
        theme_color: "#10b981",
        background_color: "#0f172a",
        display: "standalone",
        orientation: "portrait",
        icons: [
          {
            src: "elephant-logo.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "elephant-logo.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "elephant-logo.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "index.html",
        // Cover Netlify (/) and GitHub Pages (/Eravat2.0/) so offline SPA reloads work
        // after the first online visit that installs the service worker.
        navigateFallbackAllowlist: [/^\/$/, /^\/index\.html$/, /^\/Eravat2\.0\//],
      },
      devOptions: {
        enabled: true,
        navigateFallbackAllowlist: [/^\/$/, /^\/index\.html$/, /^\/Eravat2\.0\//],
      },
    }),
  ],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/setupTests.ts",
    css: true,
    exclude: ["tests/**", "node_modules/**"]
  },
});

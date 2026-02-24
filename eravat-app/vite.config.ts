import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
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
      devOptions: {
        enabled: true,
      },
    }),
  ],
});

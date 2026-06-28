import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { annotationPlugin } from "@web-annotation/vite"

export default defineConfig({
  plugins: [
    // `enforce: "pre"` (set inside the plugin) injects attributes before
    // plugin-react compiles JSX, so they survive into the rendered DOM.
    annotationPlugin({ mode: "source" }),
    react(),
  ],
})

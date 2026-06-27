import { defineConfig } from "vite"
import { fileURLToPath } from "node:url"

// Alias the package to its source so the example runs without a prior build.
const coreSrc = fileURLToPath(
  new URL("../../packages/annotation-core/src/index.ts", import.meta.url),
)

export default defineConfig({
  resolve: {
    alias: {
      "@web-annotation/core": coreSrc,
    },
  },
})

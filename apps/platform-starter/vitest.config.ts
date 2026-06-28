import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

// Resolve workspace packages from source so tests don't depend on a prior build.
const coreSrc = fileURLToPath(
  new URL("../../packages/annotation-core/src/index.ts", import.meta.url),
)
const nodeSrc = fileURLToPath(
  new URL("../../packages/annotation-node/src/index.ts", import.meta.url),
)

export default defineConfig({
  resolve: {
    alias: {
      "@web-annotation/core": coreSrc,
      "@web-annotation/node": nodeSrc,
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
})

import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

// Resolve the core contract from source so tests don't depend on a prior build.
const coreSrc = fileURLToPath(
  new URL("../annotation-core/src/index.ts", import.meta.url),
)

export default defineConfig({
  resolve: {
    alias: {
      "@web-annotation/core": coreSrc,
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
})

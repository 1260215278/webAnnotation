import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "node18",
  // Keep heavy / host-provided deps external; they are resolved at the user's build time.
  external: ["@babel/core", "@babel/types", "vite", "@web-annotation/core"],
})

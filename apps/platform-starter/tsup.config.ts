import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts", "src/main.ts"],
  format: ["esm", "cjs"],
  // App, not a published library: skip d.ts emission.
  dts: false,
  clean: true,
  sourcemap: true,
  target: "node18",
  // Workspace packages are resolved at install time via node_modules.
  external: ["@web-annotation/core", "@web-annotation/node"],
})

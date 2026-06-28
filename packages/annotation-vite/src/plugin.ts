import type { Plugin } from "vite"
import { createFilter } from "vite"
import type { SourceMode } from "@web-annotation/core"
import { transformReactSource } from "./transform"
import { createManifest } from "./manifest"
import type { AnnotationPluginOptions } from "./types"

const DEFAULT_INCLUDE = ["src/**/*.{jsx,tsx}"]
const DEFAULT_EXCLUDE = [
  "**/node_modules/**",
  "**/*.test.*",
  "**/*.spec.*",
  "**/*.stories.*",
]

function toRelative(root: string, file: string): string {
  const normalizedRoot = root.split("\\").join("/").replace(/\/$/, "")
  const normalizedFile = file.split("\\").join("/")
  if (normalizedRoot && normalizedFile.startsWith(`${normalizedRoot}/`)) {
    return normalizedFile.slice(normalizedRoot.length + 1)
  }
  return normalizedFile
}

/**
 * Vite plugin that injects React source metadata onto intrinsic HTML elements,
 * so the runtime SDK can map an annotated DOM node back to its source location.
 */
export function annotationPlugin(options: AnnotationPluginOptions = {}): Plugin {
  const mode: SourceMode = options.mode ?? "source"
  const manifest = createManifest()
  let root = options.root ?? process.cwd()
  let filter = createFilter(
    options.include ?? DEFAULT_INCLUDE,
    options.exclude ?? DEFAULT_EXCLUDE,
    { resolve: root },
  )

  return {
    name: "web-annotation:source",
    enforce: "pre",

    configResolved(config) {
      if (!options.root) {
        root = config.root
        filter = createFilter(
          options.include ?? DEFAULT_INCLUDE,
          options.exclude ?? DEFAULT_EXCLUDE,
          { resolve: root },
        )
      }
    },

    transform(code, id) {
      if (mode === "disabled") return null

      const file = id.split("?")[0]
      if (!/\.[jt]sx$/.test(file)) return null
      if (!filter(file)) return null

      const result = transformReactSource({
        code,
        filename: toRelative(root, file),
        mode,
        typescript: file.endsWith(".tsx"),
        framework: "react",
      })

      if (result.entries.length === 0) return null

      manifest.merge(result.entries)
      options.onManifest?.(manifest.toJSON())

      return { code: result.code, map: result.map }
    },
  }
}

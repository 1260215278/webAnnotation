import type { SourceMode } from "@web-annotation/core"
import type { Rollup } from "vite"

/** A single injected element's source location. */
export interface SourceEntry {
  /** Anonymous, deterministic id derived from file + line + column. */
  sourceId: string
  file: string
  line: number
  column: number
  component?: string
  framework: string
  /** Intrinsic HTML tag name that received the attributes. */
  tag: string
}

/** Maps every injected `sourceId` back to its source location. */
export type SourceManifest = Record<string, SourceEntry>

export interface AnnotationPluginOptions {
  /**
   * Injection mode. Default `"source"`.
   * - `source`: inject id + file/line/column/component/framework (dev / staging).
   * - `safe`: inject only the anonymous id (production).
   * - `disabled`: inject nothing.
   */
  mode?: SourceMode
  /** Glob(s) of files to transform. Default `["src/**\/*.{jsx,tsx}"]`. */
  include?: string | string[]
  /** Glob(s) of files to skip. Default excludes node_modules, tests and stories. */
  exclude?: string | string[]
  /** Only `"react"` is supported in this MVP. */
  framework?: "react"
  /** Base directory used to compute relative file paths. Defaults to the Vite root. */
  root?: string
  /** Called whenever the manifest grows, with a snapshot of the current manifest. */
  onManifest?: (manifest: SourceManifest) => void
}

/** Input for the pure (Vite-independent) React transform. */
export interface TransformInput {
  code: string
  /** Project-relative file path used for ids and attributes. */
  filename: string
  /** `disabled` is handled before calling, so only these two reach the transform. */
  mode: "source" | "safe"
  typescript: boolean
  framework?: string
}

export interface TransformOutput {
  code: string
  map: Rollup.SourceMapInput | null
  entries: SourceEntry[]
}

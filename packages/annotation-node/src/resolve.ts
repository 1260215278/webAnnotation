import type { AnnotationPayload, SourceMetadata } from "@web-annotation/core"
import type { SourceManifest } from "./types"

/**
 * Return a new payload in which every annotation source carrying a `sourceId`
 * present in `manifest` is enriched with the manifest's `file/line/column/
 * component/framework`. Fields already present on the source win (so resolving a
 * `source`-mode payload is a no-op). The input payload is never mutated; sources
 * without a `sourceId`, or with an id missing from the manifest, are passed through
 * unchanged. The `mode` of each source is preserved.
 */
export function resolvePayloadSources(
  payload: AnnotationPayload,
  manifest: SourceManifest,
): AnnotationPayload {
  return {
    ...payload,
    annotations: payload.annotations.map((anno) => {
      const source = anno.target.source
      if (!source || source.sourceId === undefined) return anno

      const entry = manifest[source.sourceId]
      if (!entry) return anno

      const resolved: SourceMetadata = {
        ...source,
        file: source.file ?? entry.file,
        line: source.line ?? entry.line,
        column: source.column ?? entry.column,
        framework: source.framework ?? entry.framework,
      }
      if (source.component === undefined && entry.component !== undefined) {
        resolved.component = entry.component
      }

      return {
        ...anno,
        target: { ...anno.target, source: resolved },
      }
    }),
  }
}

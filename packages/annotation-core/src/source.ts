import type { RuntimeSourceMode, SourceMetadata } from "./types"

/**
 * DOM attribute contract shared between the build plugin (`@web-annotation/vite`)
 * and this runtime SDK. The build plugin writes these attributes onto intrinsic
 * HTML elements; the runtime reads them back when constructing a payload.
 *
 * This object is the single source of truth for the attribute names — the Vite
 * plugin imports it rather than re-declaring strings, so the two sides cannot drift.
 */
export const SOURCE_ATTR = {
  /** Anonymous, stable id for the element's source location. Always present when injected. */
  id: "data-anno-source-id",
  /** Injection mode: "source" exposes location details; "safe" exposes only the id. */
  mode: "data-anno-source-mode",
  file: "data-anno-source-file",
  line: "data-anno-source-line",
  column: "data-anno-source-column",
  component: "data-anno-source-component",
  framework: "data-anno-source-framework",
} as const

function parsePositiveInt(value: string | null): number | undefined {
  if (value === null) return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

/**
 * Read source metadata injected by the build plugin, starting from the given
 * element and walking up to the nearest annotated ancestor. Returns `undefined`
 * when no plugin attributes are present, so payload behaviour is unchanged when
 * the build plugin is absent or running in `disabled` mode.
 */
export function readSourceMetadata(el: Element): SourceMetadata | undefined {
  const host = el.closest(`[${SOURCE_ATTR.id}]`)
  if (!host) return undefined

  const sourceId = host.getAttribute(SOURCE_ATTR.id)
  if (!sourceId) return undefined

  const rawMode = host.getAttribute(SOURCE_ATTR.mode)
  const mode: RuntimeSourceMode = rawMode === "source" ? "source" : "safe"

  const metadata: SourceMetadata = { mode, sourceId }

  // In safe mode the browser must only ever see the anonymous id.
  if (mode !== "source") return metadata

  const file = host.getAttribute(SOURCE_ATTR.file)
  const component = host.getAttribute(SOURCE_ATTR.component)
  const framework = host.getAttribute(SOURCE_ATTR.framework)
  const line = parsePositiveInt(host.getAttribute(SOURCE_ATTR.line))
  const column = parsePositiveInt(host.getAttribute(SOURCE_ATTR.column))

  if (file) metadata.file = file
  if (line !== undefined) metadata.line = line
  if (column !== undefined) metadata.column = column
  if (component) metadata.component = component
  if (framework) metadata.framework = framework

  return metadata
}

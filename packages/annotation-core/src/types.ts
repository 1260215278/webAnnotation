/**
 * AnnotationPayload v1 type definitions.
 *
 * These types are the public contract of the runtime SDK. They intentionally
 * mirror the payload shape documented in the project README. Fields that depend
 * on packages not yet implemented (e.g. the Vite source-metadata plugin) are
 * marked optional and are only populated when that data is actually available.
 */

export type AnnotationVersion = "v1"

export type AnnotationMode = "single" | "batch"

/** Source-mapping mode. Produced by the (planned) build plugin, not the SDK. */
export type SourceMode = "source" | "safe" | "disabled"

export interface Viewport {
  width: number
  height: number
}

export interface ElementRect {
  x: number
  y: number
  width: number
  height: number
}

export interface ProjectInfo {
  projectId: string
  environment?: string
  release?: string
  commit?: string
}

export interface PageInfo {
  url: string
  route: string
  title: string
  viewport: Viewport
}

/**
 * Source metadata for an annotated element. Populated only when a build plugin
 * has injected source attributes into the DOM. Not yet produced in this MVP.
 */
export interface SourceMetadata {
  mode: SourceMode
  framework?: string
  file?: string
  line?: number
  column?: number
  component?: string
  sourceId?: string
}

export interface AnnotationTarget {
  /** Stable selector based on an injected `data-annotation-id` attribute. */
  selector: string
  /** Human-readable CSS path, useful as a fallback locator. */
  cssPath: string
  tagName: string
  /** Trimmed, length-capped visible text of the element. */
  text: string
  rect: ElementRect
  /** Sanitized outer HTML of the element. Present when DOM snapshot is enabled. */
  domSnapshot?: string
  source?: SourceMetadata
}

export interface AnnotationItem {
  id: string
  message: string
  target: AnnotationTarget
  /** ISO-8601 timestamp. */
  createdAt: string
}

export interface AnnotationGroup {
  id: string
  mode: AnnotationMode
}

export interface AnnotationPayload {
  version: AnnotationVersion
  project: ProjectInfo
  page: PageInfo
  annotationGroup: AnnotationGroup
  annotations: AnnotationItem[]
}

/** Capture toggles. `screenshot` and `sourceMetadata` are planned, not yet implemented. */
export interface CaptureOptions {
  /** Include a sanitized DOM snapshot of the target element. Default: true. */
  domSnapshot?: boolean
  /** Planned: include a screenshot reference. Not implemented in this MVP. */
  screenshot?: boolean
  /** Planned: how to resolve source metadata. Not implemented in this MVP. */
  sourceMetadata?: "auto" | "disabled"
}

export interface AnnotatorOptions {
  projectId: string
  environment?: string
  release?: string
  commit?: string
  /** HTTP endpoint that receives the payload via POST. Used when `submitAnnotation` is absent. */
  endpoint?: string
  /** Returns a short-lived auth token attached as `Authorization: Bearer <token>`. */
  getAuthToken?: () => string | Promise<string>
  /** Full control over submission. Takes precedence over `endpoint`. */
  submitAnnotation?: (payload: AnnotationPayload) => void | Promise<void>
  capture?: CaptureOptions
}

export interface Annotator {
  /** Enter annotation mode: hover highlight + click-to-lock. */
  enable: () => void
  /** Leave annotation mode and remove all injected UI. */
  disable: () => void
  /** Whether annotation mode is currently active. */
  isEnabled: () => boolean
  /** Mount a floating toggle button. Safe to call once. */
  mountWidget: () => void
  /** Tear everything down (disable + remove widget). */
  destroy: () => void
}

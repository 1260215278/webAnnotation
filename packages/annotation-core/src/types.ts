/**
 * AnnotationPayload v1 type definitions.
 *
 * These types are the public contract of the runtime SDK. They intentionally
 * mirror the payload shape documented in the project README. Fields that depend
 * on packages not yet implemented (e.g. the Vite source-metadata plugin) are
 * marked optional and are only populated when that data is actually available.
 */

import type { AnnotationLocale } from "./i18n"

export type AnnotationVersion = "v1"

export type AnnotationMode = "single" | "batch"

/** Source-mapping mode. Produced by the (planned) build plugin, not the SDK. */
export type SourceMode = "source" | "safe" | "disabled"
export type RuntimeSourceMode = Exclude<SourceMode, "disabled">

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
 * Source metadata for an annotated element. Populated when a build plugin has
 * injected source attributes into the DOM and runtime capture has not disabled it.
 */
export interface SourceMetadata {
  mode: RuntimeSourceMode
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

/** Storage backends an uploaded image attachment can reference. */
export type ImageAttachmentProvider = "server" | "oss" | "custom"

/**
 * Reference to an uploaded image. The payload never carries raw image bytes; it
 * only points at the stored object via one of these references.
 */
export interface ImageAttachmentStorage {
  provider: ImageAttachmentProvider
  /** Public or signed URL of the uploaded image, when the backend exposes one. */
  url?: string
  /** Object key / path within the storage backend (e.g. an OSS object key). */
  objectKey?: string
  /** Backend-specific upload identifier, when the host returns one. */
  uploadId?: string
}

/**
 * An image attached to an annotation. The raw image is uploaded out-of-band (to
 * the host's server or object storage); this record only describes and
 * references the stored object — it must never contain base64 image content.
 */
export interface AnnotationImageAttachment {
  id: string
  kind: "image"
  name: string
  mimeType: string
  /** Size of the uploaded image in bytes. */
  size: number
  width?: number
  height?: number
  storage: ImageAttachmentStorage
  /** Optional host-provided metadata. Must not contain raw image content. */
  metadata?: Record<string, unknown>
}

/** An attachment carried by an annotation. Only images are supported in v1. */
export type AnnotationAttachment = AnnotationImageAttachment

export interface AnnotationItem {
  id: string
  message: string
  target: AnnotationTarget
  /** Uploaded attachments (e.g. images). Never contains raw image bytes. */
  attachments?: AnnotationAttachment[]
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

/** Capture toggles. */
export interface CaptureOptions {
  /** Include a sanitized DOM snapshot of the target element. Default: true. */
  domSnapshot?: boolean
  /** Planned: include a screenshot reference. Not implemented in this MVP. */
  screenshot?: boolean
  /** Read source metadata from injected DOM attributes. Default: "auto". */
  sourceMetadata?: "auto" | "disabled"
}

/** Context passed to a host `uploadImage` implementation. */
export interface UploadImageContext {
  projectId: string
  environment?: string
  page: {
    url: string
    route: string
    title: string
  }
}

/** Image attachment options for the runtime popup. */
export interface ImageAttachmentsOptions {
  /** Enable the image picker in the annotation popup. */
  images?: boolean
  /** Max number of images per annotation. Default: 4. */
  maxImages?: number
  /** Max size in bytes for a single image. Default: 5 MiB. */
  maxImageBytes?: number
  /** Accepted image MIME types. Default: the shared image MIME allow-list. */
  acceptedImageTypes?: string[]
  /**
   * Full control over uploading an image (e.g. the host uploads to OSS and
   * returns attachment metadata). Takes precedence over `uploadEndpoint`.
   */
  uploadImage?: (file: File, context: UploadImageContext) => Promise<AnnotationImageAttachment>
  /**
   * HTTP endpoint that accepts a JSON/base64 image upload and returns
   * `{ attachment }`. Used when `uploadImage` is absent. The base64 body is only
   * sent to this endpoint; the final payload keeps only the returned reference.
   */
  uploadEndpoint?: string
  /** Returns a short-lived token attached to the upload as `Authorization: Bearer <token>`. */
  getUploadAuthToken?: () => string | Promise<string>
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
  /** Image attachment configuration for the annotation popup. */
  attachments?: ImageAttachmentsOptions
  /** UI locale. Defaults to detecting Chinese from `navigator.language`, else English. */
  locale?: AnnotationLocale
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

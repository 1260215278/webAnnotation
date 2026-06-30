import type {
  AnnotationPayload,
  ImageAttachmentProvider,
  SourceMetadata,
} from "@web-annotation/core"

/** A single, human-readable validation problem with a JSON-path-like location. */
export interface ValidationIssue {
  /** Location of the problem, e.g. `annotations[0].target.selector`. Empty for the root. */
  path: string
  message: string
}

export type ValidatePayloadResult =
  | { ok: true; payload: AnnotationPayload }
  | { ok: false; issues: ValidationIssue[] }

/**
 * One entry of a source manifest, mapping an anonymous `sourceId` to its real
 * source location. This mirrors the JSON shape produced by `@web-annotation/vite`'s
 * manifest, but is declared here so the Node kit does not depend on the build plugin.
 */
export interface SourceManifestEntry {
  sourceId: string
  file: string
  line: number
  column: number
  framework: string
  component?: string
  /** Intrinsic HTML tag that received the source attributes. Optional and informational. */
  tag?: string
}

/** Maps every `sourceId` back to its source location. */
export type SourceManifest = Record<string, SourceManifestEntry>

export type ValidateManifestResult =
  | { ok: true; manifest: SourceManifest }
  | { ok: false; issues: ValidationIssue[] }

export interface PatchPromptTarget {
  selector: string
  cssPath: string
  tagName: string
  text: string
  /** Sanitized DOM snapshot, length-capped for prompt budgets. */
  domSnapshot?: string
}

export interface PatchPromptSource {
  mode: SourceMetadata["mode"]
  sourceId?: string
  file?: string
  line?: number
  column?: number
  component?: string
  framework?: string
}

/** Storage reference summary for an image attachment. Never contains raw bytes. */
export interface PatchPromptImageAttachmentStorage {
  provider: ImageAttachmentProvider
  url?: string
  objectKey?: string
}

/**
 * Deterministic summary of an image attachment for AI patch context. Describes
 * and references the uploaded image (name, type, size, dimensions, storage) but
 * never carries the raw image content.
 */
export interface PatchPromptImageAttachment {
  id: string
  kind: "image"
  name: string
  mimeType: string
  size: number
  width?: number
  height?: number
  storage: PatchPromptImageAttachmentStorage
}

export interface PatchPromptAnnotation {
  id: string
  message: string
  createdAt: string
  target: PatchPromptTarget
  source?: PatchPromptSource
  attachments?: PatchPromptImageAttachment[]
}

/**
 * Deterministic, JSON-serializable summary of an annotation payload, intended as
 * the structured context for an AI patch prompt. Contains no functions or DOM nodes.
 */
export interface PatchPromptContext {
  version: "v1"
  project: {
    projectId: string
    environment?: string
    release?: string
    commit?: string
  }
  page: {
    url: string
    route: string
    title: string
  }
  annotationGroup: {
    id: string
    mode: AnnotationPayload["annotationGroup"]["mode"]
  }
  annotations: PatchPromptAnnotation[]
}

export interface BuildPatchPromptContextOptions {
  /** Max length for each target's `domSnapshot` summary. Default `2000`. */
  maxDomSnapshotLength?: number
}

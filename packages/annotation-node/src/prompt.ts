import type {
  AnnotationImageAttachment,
  AnnotationItem,
  AnnotationPayload,
  SourceMetadata,
} from "@web-annotation/core"
import type {
  BuildPatchPromptContextOptions,
  PatchPromptAnnotation,
  PatchPromptContext,
  PatchPromptImageAttachment,
  PatchPromptImageAttachmentStorage,
  PatchPromptSource,
  PatchPromptTarget,
} from "./types"

const DEFAULT_MAX_DOM_SNAPSHOT = 2000

function truncate(value: string, max: number): string {
  if (max > 0 && value.length > max) return value.slice(0, max)
  return value
}

function summarizeSource(source: SourceMetadata): PatchPromptSource {
  const out: PatchPromptSource = { mode: source.mode }
  if (source.sourceId !== undefined) out.sourceId = source.sourceId
  if (source.file !== undefined) out.file = source.file
  if (source.line !== undefined) out.line = source.line
  if (source.column !== undefined) out.column = source.column
  if (source.component !== undefined) out.component = source.component
  if (source.framework !== undefined) out.framework = source.framework
  return out
}

function summarizeAttachment(att: AnnotationImageAttachment): PatchPromptImageAttachment {
  const storage: PatchPromptImageAttachmentStorage = { provider: att.storage.provider }
  if (att.storage.url !== undefined) storage.url = att.storage.url
  if (att.storage.objectKey !== undefined) storage.objectKey = att.storage.objectKey

  const summary: PatchPromptImageAttachment = {
    id: att.id,
    kind: att.kind,
    name: att.name,
    mimeType: att.mimeType,
    size: att.size,
    storage,
  }
  if (att.width !== undefined) summary.width = att.width
  if (att.height !== undefined) summary.height = att.height
  return summary
}

function summarizeAnnotation(anno: AnnotationItem, maxDomSnapshot: number): PatchPromptAnnotation {
  const target: PatchPromptTarget = {
    selector: anno.target.selector,
    cssPath: anno.target.cssPath,
    tagName: anno.target.tagName,
    text: anno.target.text,
  }
  if (anno.target.domSnapshot !== undefined) {
    target.domSnapshot = truncate(anno.target.domSnapshot, maxDomSnapshot)
  }

  const result: PatchPromptAnnotation = {
    id: anno.id,
    message: anno.message,
    createdAt: anno.createdAt,
    target,
  }
  if (anno.target.source !== undefined) {
    result.source = summarizeSource(anno.target.source)
  }
  if (anno.attachments !== undefined && anno.attachments.length > 0) {
    result.attachments = anno.attachments.map(summarizeAttachment)
  }
  return result
}

/**
 * Build a deterministic, JSON-serializable summary of an annotation payload for
 * use as AI patch prompt context. The output depends only on the input payload and
 * options (no timestamps, randomness, functions, or DOM objects), so the same input
 * always yields an identical, serializable result.
 */
export function buildPatchPromptContext(
  payload: AnnotationPayload,
  options: BuildPatchPromptContextOptions = {},
): PatchPromptContext {
  const maxDomSnapshot = options.maxDomSnapshotLength ?? DEFAULT_MAX_DOM_SNAPSHOT

  const project: PatchPromptContext["project"] = { projectId: payload.project.projectId }
  if (payload.project.environment !== undefined) project.environment = payload.project.environment
  if (payload.project.release !== undefined) project.release = payload.project.release
  if (payload.project.commit !== undefined) project.commit = payload.project.commit

  return {
    version: "v1",
    project,
    page: {
      url: payload.page.url,
      route: payload.page.route,
      title: payload.page.title,
    },
    annotationGroup: {
      id: payload.annotationGroup.id,
      mode: payload.annotationGroup.mode,
    },
    annotations: payload.annotations.map((anno) => summarizeAnnotation(anno, maxDomSnapshot)),
  }
}

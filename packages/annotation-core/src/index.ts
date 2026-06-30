export { createAnnotator } from "./annotator"
export {
  buildAnnotationPayload,
  buildAnnotationItem,
  buildPageInfo,
} from "./payload"
export { submitPayload } from "./submit"
export { sanitizeDomSnapshot } from "./snapshot"
export {
  buildSelector,
  buildCssPath,
  ANNOTATION_ID_ATTR,
  ANNOTATION_UI_ATTR,
} from "./selector"
export { createId } from "./id"
export { readSourceMetadata, SOURCE_ATTR } from "./source"
export {
  IMAGE_ATTACHMENT_MIME_TYPES,
  isImageAttachmentMimeType,
  uploadAnnotationImage,
  DEFAULT_MAX_IMAGES,
  DEFAULT_MAX_IMAGE_BYTES,
} from "./attachments"
export { getRuntimeLabels, resolveAnnotationLocale } from "./i18n"

export type {
  ImageAttachmentMimeType,
  ImageUploadRequest,
  ImageUploadResponse,
  UploadImageDeps,
} from "./attachments"
export type { AnnotationLocale, RuntimeLabels } from "./i18n"

export type {
  Annotator,
  AnnotatorOptions,
  AnnotationPayload,
  AnnotationItem,
  AnnotationGroup,
  AnnotationTarget,
  AnnotationAttachment,
  AnnotationImageAttachment,
  ImageAttachmentStorage,
  ImageAttachmentProvider,
  ImageAttachmentsOptions,
  UploadImageContext,
  AnnotationMode,
  AnnotationVersion,
  CaptureOptions,
  ElementRect,
  PageInfo,
  ProjectInfo,
  SourceMetadata,
  SourceMode,
  Viewport,
} from "./types"

export type { BuildPayloadInput, BuildAnnotationItemInput } from "./payload"

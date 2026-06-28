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

export type {
  Annotator,
  AnnotatorOptions,
  AnnotationPayload,
  AnnotationItem,
  AnnotationGroup,
  AnnotationTarget,
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

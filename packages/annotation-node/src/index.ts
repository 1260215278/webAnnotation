export {
  validateAnnotationPayload,
  assertAnnotationPayload,
  validateSourceManifest,
  AnnotationPayloadError,
} from "./validate"
export { resolvePayloadSources } from "./resolve"
export { buildPatchPromptContext } from "./prompt"

export type {
  ValidationIssue,
  ValidatePayloadResult,
  ValidateManifestResult,
  SourceManifest,
  SourceManifestEntry,
  PatchPromptContext,
  PatchPromptAnnotation,
  PatchPromptTarget,
  PatchPromptSource,
  BuildPatchPromptContextOptions,
} from "./types"

export {
  validateAnnotationPayload,
  assertAnnotationPayload,
  validateSourceManifest,
  AnnotationPayloadError,
} from "./validate"
export { resolvePayloadSources } from "./resolve"
export { buildPatchPromptContext } from "./prompt"
export { collectRepoSourceContext } from "./repoSource"
export {
  collectUnifiedDiffTargetFiles,
  validateUnifiedDiffTargetFiles,
} from "./unifiedDiff"

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
  PatchPromptImageAttachment,
  PatchPromptImageAttachmentStorage,
  BuildPatchPromptContextOptions,
} from "./types"

export type {
  RepoSourceContextOptions,
  RepoSourceContext,
  RepoSourceFile,
  RepoSourceFileAnnotation,
  RepoSourceIssue,
} from "./repoSource"

export type {
  CollectUnifiedDiffTargetFilesResult,
  ValidateUnifiedDiffTargetFilesResult,
} from "./unifiedDiff"

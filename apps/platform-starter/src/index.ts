export { createPlatformServer, handlePlatformRequest } from "./server"
export { createTaskStore } from "./store"
export { buildMockPatchProposal } from "./mockPatch"
export { buildPatchProviderInput, buildProviderPatchProposal } from "./patchProvider"
export {
  PATCH_REVIEW_DECISIONS,
  buildPatchReview,
  isPatchReviewDecision,
  reviewStatusForDecision,
  taskStatusForDecision,
} from "./patchReview"
export { createHttpPatchProvider } from "./httpPatchProvider"
export { createPlatformServerOptionsFromEnv, readPlatformPortFromEnv } from "./env"
export { renderConsoleHtml } from "./console"

export type {
  PlatformRequest,
  PlatformResponse,
  PlatformRuntimeOptions,
  PlatformServer,
  PlatformServerOptions,
  PlatformSourceContextOptions,
} from "./server"
export type {
  Task,
  TaskStatus,
  TaskSummary,
  TaskStore,
  PatchProposal,
  PatchProposalStatus,
  PatchReview,
  PatchReviewDecision,
  PatchReviewStatus,
  SourceContextStatus,
} from "./store"
export type { PatchProvider, PatchProviderInput, PatchProviderResult } from "./patchProvider"
export type { PatchReviewInput } from "./patchReview"
export type { HttpPatchProviderOptions } from "./httpPatchProvider"
export type { PlatformEnvDependencies } from "./env"

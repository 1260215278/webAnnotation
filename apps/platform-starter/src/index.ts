export { createPlatformServer, handlePlatformRequest } from "./server"
export { createTaskStore } from "./store"
export { buildMockPatchProposal } from "./mockPatch"
export { buildPatchProviderInput, buildProviderPatchProposal } from "./patchProvider"
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
  SourceContextStatus,
} from "./store"
export type { PatchProvider, PatchProviderInput, PatchProviderResult } from "./patchProvider"
export type { HttpPatchProviderOptions } from "./httpPatchProvider"
export type { PlatformEnvDependencies } from "./env"

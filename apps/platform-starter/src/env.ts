import { createHttpPatchProvider } from "./httpPatchProvider"
import { createOpenAICompatiblePatchProvider } from "./openaiPatchProvider"
import { createMemoryImageStorage } from "./imageStorage"
import type { PlatformServerOptions } from "./server"

export interface PlatformEnvDependencies {
  fetch?: typeof fetch
}

type PlatformEnv = Record<string, string | undefined>

/**
 * Which patch provider the environment selects. `http` is the third-party HTTP
 * adapter (`WEB_ANNOTATION_PATCH_PROVIDER_URL`); `model` is the OpenAI-compatible
 * model adapter (`WEB_ANNOTATION_MODEL_PROVIDER_URL`). Used for startup logging.
 */
export type PatchProviderKind = "none" | "http" | "model"

function readOptional(env: PlatformEnv, key: string): string | undefined {
  const value = env[key]?.trim()
  return value ? value : undefined
}

export function readPlatformPortFromEnv(env: PlatformEnv): number {
  const port = Number(readOptional(env, "PORT") ?? 4319)
  return Number.isFinite(port) ? port : 4319
}

/**
 * Resolve which patch provider the environment selects. Exactly one patch
 * provider may be configured; conflicting configuration fails loudly rather than
 * silently picking a winner. This is the single source of truth shared by the
 * server options factory and the startup logging in `main.ts`.
 */
export function resolvePatchProviderKind(env: PlatformEnv): PatchProviderKind {
  const httpEndpoint = readOptional(env, "WEB_ANNOTATION_PATCH_PROVIDER_URL")
  const modelEndpoint = readOptional(env, "WEB_ANNOTATION_MODEL_PROVIDER_URL")
  if (httpEndpoint && modelEndpoint) {
    throw new Error(
      "configure only one patch provider: set WEB_ANNOTATION_PATCH_PROVIDER_URL or " +
        "WEB_ANNOTATION_MODEL_PROVIDER_URL, not both",
    )
  }
  if (httpEndpoint) return "http"
  if (modelEndpoint) return "model"
  return "none"
}

/** Human-readable startup line describing the active patch provider. */
export function describePatchProviderStartup(kind: PatchProviderKind): string {
  switch (kind) {
    case "http":
      return "external HTTP patch provider enabled"
    case "model":
      return "model patch provider enabled"
    default:
      return "patch provider disabled"
  }
}

export function createPlatformServerOptionsFromEnv(
  env: PlatformEnv,
  dependencies: PlatformEnvDependencies = {},
): PlatformServerOptions {
  const repoRoot = readOptional(env, "WEB_ANNOTATION_REPO_ROOT") ?? readOptional(env, "REPO_ROOT")
  const patchProviderEndpoint = readOptional(env, "WEB_ANNOTATION_PATCH_PROVIDER_URL")
  const patchProviderToken =
    readOptional(env, "WEB_ANNOTATION_PATCH_PROVIDER_TOKEN") ??
    readOptional(env, "PATCH_PROVIDER_TOKEN")

  const modelProviderEndpoint = readOptional(env, "WEB_ANNOTATION_MODEL_PROVIDER_URL")
  const modelProviderApiKey = readOptional(env, "WEB_ANNOTATION_MODEL_PROVIDER_API_KEY")
  const modelProviderModel = readOptional(env, "WEB_ANNOTATION_MODEL_PROVIDER_MODEL")

  const imageStorage = readOptional(env, "WEB_ANNOTATION_IMAGE_STORAGE")

  // `resolvePatchProviderKind` owns the conflict check, so the two provider
  // branches below stay mutually exclusive.
  const patchProviderKind = resolvePatchProviderKind(env)

  const options: PlatformServerOptions = {}
  if (repoRoot) {
    options.repoRoot = repoRoot
  }
  if (patchProviderKind === "http" && patchProviderEndpoint) {
    options.patchProvider = createHttpPatchProvider({
      endpoint: patchProviderEndpoint,
      getAuthToken: patchProviderToken ? () => patchProviderToken : undefined,
      fetch: dependencies.fetch,
    })
  } else if (patchProviderKind === "model" && modelProviderEndpoint) {
    if (!modelProviderModel) {
      throw new Error(
        "WEB_ANNOTATION_MODEL_PROVIDER_MODEL is required when WEB_ANNOTATION_MODEL_PROVIDER_URL is set",
      )
    }
    options.patchProvider = createOpenAICompatiblePatchProvider({
      endpoint: modelProviderEndpoint,
      model: modelProviderModel,
      getApiKey: modelProviderApiKey ? () => modelProviderApiKey : undefined,
      fetch: dependencies.fetch,
    })
  }
  // The built-in `memory` provider is for local development and demos only; a host
  // injects a real `ImageStorageProvider` (e.g. OSS) via `createPlatformServer`.
  if (imageStorage === "memory") {
    options.imageStorageProvider = createMemoryImageStorage()
  }
  return options
}

import { createHttpPatchProvider } from "./httpPatchProvider"
import type { PlatformServerOptions } from "./server"

export interface PlatformEnvDependencies {
  fetch?: typeof fetch
}

type PlatformEnv = Record<string, string | undefined>

function readOptional(env: PlatformEnv, key: string): string | undefined {
  const value = env[key]?.trim()
  return value ? value : undefined
}

export function readPlatformPortFromEnv(env: PlatformEnv): number {
  const port = Number(readOptional(env, "PORT") ?? 4319)
  return Number.isFinite(port) ? port : 4319
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

  const options: PlatformServerOptions = {}
  if (repoRoot) {
    options.repoRoot = repoRoot
  }
  if (patchProviderEndpoint) {
    options.patchProvider = createHttpPatchProvider({
      endpoint: patchProviderEndpoint,
      getAuthToken: patchProviderToken ? () => patchProviderToken : undefined,
      fetch: dependencies.fetch,
    })
  }
  return options
}

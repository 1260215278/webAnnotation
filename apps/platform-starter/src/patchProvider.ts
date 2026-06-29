import type { PatchPromptContext, RepoSourceContext } from "@web-annotation/node"
import type { PatchProposal, Task } from "./store"

export interface PatchProviderInput {
  task: Task
  promptContext: PatchPromptContext
  sourceContext?: RepoSourceContext
}

export interface PatchProviderResult {
  summary: string
  suggestedFiles: string[]
  diffPreview: string
  metadata?: Record<string, unknown>
}

export interface PatchProvider {
  generatePatch: (
    input: PatchProviderInput,
  ) => PatchProviderResult | Promise<PatchProviderResult>
}

const PATCH_PROVIDER_RESULT_ERROR = "patch provider response is invalid"

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function invalidPatchProviderResult(message: string): never {
  throw new Error(`${PATCH_PROVIDER_RESULT_ERROR}: ${message}`)
}

export function validatePatchProviderResult(input: unknown): PatchProviderResult {
  if (!isObject(input)) {
    invalidPatchProviderResult("response must be an object")
  }
  if (typeof input.summary !== "string") {
    invalidPatchProviderResult("summary must be a string")
  }
  const summary = input.summary.trim()
  if (summary === "") {
    invalidPatchProviderResult("summary must not be empty")
  }
  if (!Array.isArray(input.suggestedFiles)) {
    invalidPatchProviderResult("suggestedFiles must be an array")
  }
  if (input.suggestedFiles.length === 0) {
    invalidPatchProviderResult("suggestedFiles must not be empty")
  }
  const suggestedFiles = input.suggestedFiles.map((file) => {
    if (typeof file !== "string") {
      invalidPatchProviderResult("suggestedFiles must contain non-empty strings")
    }
    const trimmed = file.trim()
    if (trimmed === "") {
      invalidPatchProviderResult("suggestedFiles must contain non-empty strings")
    }
    return trimmed
  })
  if (typeof input.diffPreview !== "string") {
    invalidPatchProviderResult("diffPreview must be a string")
  }
  const diffPreview = input.diffPreview.trim()
  if (diffPreview === "") {
    invalidPatchProviderResult("diffPreview must not be empty")
  }
  if (input.metadata !== undefined && !isObject(input.metadata)) {
    invalidPatchProviderResult("metadata must be an object")
  }

  return {
    summary,
    suggestedFiles,
    diffPreview,
    metadata: input.metadata,
  }
}

export function buildPatchProviderInput(task: Task): PatchProviderInput {
  return {
    task,
    promptContext: task.promptContext,
    sourceContext: task.sourceContext,
  }
}

export function buildProviderPatchProposal(
  task: Task,
  result: PatchProviderResult,
  createdAt: string,
): PatchProposal {
  return {
    id: `patch_${task.id.replace(/^task_/, "")}`,
    status: "proposed",
    createdAt,
    summary: result.summary,
    suggestedFiles: result.suggestedFiles,
    diffPreview: result.diffPreview,
    promptContext: task.promptContext,
    metadata: result.metadata,
  }
}

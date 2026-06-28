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

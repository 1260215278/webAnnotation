import { buildPatchPromptContext } from "@web-annotation/node"
import { describe, expect, it } from "vitest"
import { buildMockPatchProposal } from "../src/mockPatch"
import {
  PATCH_ARTIFACT_VERSION,
  buildPatchArtifact,
  createPatchArtifactSafety,
} from "../src/patchArtifact"
import type { Task } from "../src/store"
import { makeSourcePayload } from "./fixtures"

describe("createPatchArtifactSafety", () => {
  it("describes the artifact as export-only", () => {
    expect(createPatchArtifactSafety()).toEqual({
      appliesPatch: false,
      writesFiles: false,
      requiresHumanReview: true,
    })
  })
})

describe("buildPatchArtifact", () => {
  it("builds an export-only artifact from a task with a patch proposal", () => {
    const payload = makeSourcePayload()
    const baseTask: Task = {
      id: "task_example",
      status: "patch_proposed",
      createdAt: "2026-06-28T00:00:00.000Z",
      payload,
      promptContext: buildPatchPromptContext(payload),
    }
    const patchProposal = buildMockPatchProposal(baseTask, "2026-06-28T00:01:00.000Z")
    const task: Task = { ...baseTask, patchProposal }

    const artifact = buildPatchArtifact(task, "2026-06-28T00:02:00.000Z")

    expect(artifact.version).toBe(PATCH_ARTIFACT_VERSION)
    expect(artifact.exportedAt).toBe("2026-06-28T00:02:00.000Z")
    expect(artifact.taskId).toBe("task_example")
    expect(artifact.taskStatus).toBe("patch_proposed")
    expect(artifact.project.projectId).toBe("web-console")
    expect(artifact.page.route).toBe("/settings")
    expect(artifact.annotations).toHaveLength(1)
    expect(artifact.patchProposal).toBe(patchProposal)
    expect(artifact.patchReview).toBeUndefined()
    expect(artifact.safety).toEqual(createPatchArtifactSafety())
    expect(task.patchProposal).toBe(patchProposal)
  })

  it("copies a resolved commit into project.commit without mutating the task", () => {
    const payload = makeSourcePayload()
    const baseTask: Task = {
      id: "task_example",
      status: "patch_proposed",
      createdAt: "2026-06-28T00:00:00.000Z",
      payload,
      promptContext: buildPatchPromptContext(payload),
    }
    const patchProposal = buildMockPatchProposal(baseTask, "2026-06-28T00:01:00.000Z")
    const task: Task = { ...baseTask, patchProposal }

    const artifact = buildPatchArtifact(task, "2026-06-28T00:02:00.000Z", "deadbeef")

    expect(artifact.project.commit).toBe("deadbeef")
    // The helper is pure export-only data shaping; it never mutates the source.
    expect(task.promptContext.project.commit).toBeUndefined()
  })

  it("omits project.commit when no commit is provided (no git is run)", () => {
    const payload = makeSourcePayload()
    const baseTask: Task = {
      id: "task_example",
      status: "patch_proposed",
      createdAt: "2026-06-28T00:00:00.000Z",
      payload,
      promptContext: buildPatchPromptContext(payload),
    }
    const patchProposal = buildMockPatchProposal(baseTask, "2026-06-28T00:01:00.000Z")
    const task: Task = { ...baseTask, patchProposal }

    const artifact = buildPatchArtifact(task, "2026-06-28T00:02:00.000Z")

    expect(artifact.project.commit).toBeUndefined()
  })
})

import { describe, expect, it } from "vitest"
import { buildMockPatchProposal } from "../src/index"
import type { Task } from "../src/index"
import { buildPatchPromptContext } from "@web-annotation/node"
import { makeSourcePayload } from "./fixtures"

function makeTask(payload = makeSourcePayload()): Task {
  return {
    id: "task_fixed",
    status: "received",
    createdAt: "2026-06-28T00:00:00.000Z",
    payload,
    promptContext: buildPatchPromptContext(payload),
  }
}

describe("buildMockPatchProposal", () => {
  it("is deterministic and serializable for a fixed createdAt", () => {
    const task = makeTask()
    const a = buildMockPatchProposal(task, "2026-06-28T01:00:00.000Z")
    const b = buildMockPatchProposal(task, "2026-06-28T01:00:00.000Z")
    expect(a).toEqual(b)
    expect(JSON.parse(JSON.stringify(a))).toEqual(a)
    expect(a.status).toBe("proposed")
    expect(a.id).toBe("patch_fixed")
  })

  it("includes the source file in suggestedFiles and diff for source-mode tasks", () => {
    const proposal = buildMockPatchProposal(makeTask(), "2026-06-28T01:00:00.000Z")
    expect(proposal.suggestedFiles).toContain("src/App.tsx")
    expect(proposal.diffPreview).toContain("src/App.tsx")
    expect(proposal.diffPreview).toContain("web-annotation suggestion")
  })

  it("falls back to cssPath/selector when no source file is present", () => {
    const payload = makeSourcePayload()
    delete payload.annotations[0].target.source
    const proposal = buildMockPatchProposal(makeTask(payload), "2026-06-28T01:00:00.000Z")
    // No real file: the locator falls back to the target's cssPath.
    expect(proposal.suggestedFiles).toContain("#save")
    expect(proposal.diffPreview).toContain("#save")
  })
})

import { describe, expect, it } from "vitest"
import {
  PATCH_REVIEW_DECISIONS,
  buildPatchReview,
  isPatchReviewDecision,
  reviewStatusForDecision,
  taskStatusForDecision,
} from "../src/patchReview"

describe("isPatchReviewDecision", () => {
  it("accepts the three known decisions", () => {
    for (const decision of PATCH_REVIEW_DECISIONS) {
      expect(isPatchReviewDecision(decision)).toBe(true)
    }
  })

  it("rejects unknown or non-string values", () => {
    expect(isPatchReviewDecision("approve")).toBe(false)
    expect(isPatchReviewDecision("")).toBe(false)
    expect(isPatchReviewDecision(undefined)).toBe(false)
    expect(isPatchReviewDecision(1)).toBe(false)
  })
})

describe("decision mapping", () => {
  it("maps decisions to review status and task status", () => {
    expect(reviewStatusForDecision("accept")).toBe("accepted")
    expect(taskStatusForDecision("accept")).toBe("patch_accepted")
    expect(reviewStatusForDecision("reject")).toBe("rejected")
    expect(taskStatusForDecision("reject")).toBe("patch_rejected")
    expect(reviewStatusForDecision("changes_requested")).toBe("changes_requested")
    expect(taskStatusForDecision("changes_requested")).toBe("changes_requested")
  })
})

describe("buildPatchReview", () => {
  it("records status and decidedAt, omitting empty optional fields", () => {
    const review = buildPatchReview({ decision: "accept" }, "2026-06-28T00:00:00.000Z")
    expect(review).toEqual({ status: "accepted", decidedAt: "2026-06-28T00:00:00.000Z" })
  })

  it("includes reviewer and note when provided", () => {
    const review = buildPatchReview(
      { decision: "changes_requested", reviewer: "alice", note: "tighten copy" },
      "2026-06-28T01:00:00.000Z",
    )
    expect(review).toEqual({
      status: "changes_requested",
      decidedAt: "2026-06-28T01:00:00.000Z",
      reviewer: "alice",
      note: "tighten copy",
    })
  })
})

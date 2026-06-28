import type { PatchReview, PatchReviewDecision, PatchReviewStatus, TaskStatus } from "./store"

/** The human review decisions accepted by `POST /api/tasks/:id/patch-review`. */
export const PATCH_REVIEW_DECISIONS = ["accept", "reject", "changes_requested"] as const

/** Narrow an unknown request value to a valid review decision. */
export function isPatchReviewDecision(value: unknown): value is PatchReviewDecision {
  return (
    typeof value === "string" && (PATCH_REVIEW_DECISIONS as readonly string[]).includes(value)
  )
}

const DECISION_TO_REVIEW_STATUS: Record<PatchReviewDecision, PatchReviewStatus> = {
  accept: "accepted",
  reject: "rejected",
  changes_requested: "changes_requested",
}

const DECISION_TO_TASK_STATUS: Record<PatchReviewDecision, TaskStatus> = {
  accept: "patch_accepted",
  reject: "patch_rejected",
  changes_requested: "changes_requested",
}

/** The review status stored on the proposal for a given decision. */
export function reviewStatusForDecision(decision: PatchReviewDecision): PatchReviewStatus {
  return DECISION_TO_REVIEW_STATUS[decision]
}

/** The task lifecycle status the decision moves the task to. */
export function taskStatusForDecision(decision: PatchReviewDecision): TaskStatus {
  return DECISION_TO_TASK_STATUS[decision]
}

export interface PatchReviewInput {
  decision: PatchReviewDecision
  reviewer?: string
  note?: string
}

/**
 * Build a `PatchReview` record from a validated decision. Deterministic except for
 * `decidedAt`, supplied by the caller. Only records the decision — it never applies
 * the patch, writes repository files, or calls a Git provider.
 */
export function buildPatchReview(input: PatchReviewInput, decidedAt: string): PatchReview {
  const review: PatchReview = {
    status: reviewStatusForDecision(input.decision),
    decidedAt,
  }
  if (input.reviewer !== undefined) review.reviewer = input.reviewer
  if (input.note !== undefined) review.note = input.note
  return review
}

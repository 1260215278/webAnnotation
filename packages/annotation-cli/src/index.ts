export const PATCH_ARTIFACT_VERSION = "web-annotation.patch-artifact.v1" as const

export interface ValidationIssue {
  path: string
  message: string
}

export interface PatchArtifactSafety {
  appliesPatch: false
  writesFiles: false
  requiresHumanReview: true
}

export interface PatchArtifactPreviewProposal {
  summary: string
  suggestedFiles: string[]
  diffPreview: string
}

export interface PatchArtifactPreviewInput {
  version: typeof PATCH_ARTIFACT_VERSION
  taskId: string
  taskStatus: string
  project: {
    projectId: string
  }
  page: {
    route: string
  }
  patchProposal: PatchArtifactPreviewProposal
  patchReview?: {
    status: string
  }
  safety: PatchArtifactSafety
}

export type ValidatePatchArtifactResult =
  | { ok: true; artifact: PatchArtifactPreviewInput }
  | { ok: false; issues: ValidationIssue[] }

export interface PreviewCommandDependencies {
  readFile: (file: string) => Promise<string>
}

export interface PreviewCommandResult {
  code: number
  stdout: string
  stderr: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function stringIssue(path: string): ValidationIssue {
  const parts = path.split(".")
  return { path, message: `${parts[parts.length - 1]} must be a string` }
}

function validateSafety(value: unknown): ValidationIssue[] {
  if (!isRecord(value)) {
    return [{ path: "safety", message: "safety must be an object" }]
  }
  if (value.appliesPatch !== false) {
    return [{ path: "safety.appliesPatch", message: "appliesPatch must be false" }]
  }
  if (value.writesFiles !== false) {
    return [{ path: "safety.writesFiles", message: "writesFiles must be false" }]
  }
  if (value.requiresHumanReview !== true) {
    return [
      { path: "safety.requiresHumanReview", message: "requiresHumanReview must be true" },
    ]
  }
  return []
}

function validatePatchProposal(value: unknown): ValidationIssue[] {
  if (!isRecord(value)) {
    return [{ path: "patchProposal", message: "patchProposal must be an object" }]
  }
  if (typeof value.summary !== "string") return [stringIssue("patchProposal.summary")]
  if (!Array.isArray(value.suggestedFiles)) {
    return [{ path: "patchProposal.suggestedFiles", message: "suggestedFiles must be an array" }]
  }
  if (!value.suggestedFiles.every((file) => typeof file === "string")) {
    return [
      { path: "patchProposal.suggestedFiles", message: "suggestedFiles must contain strings" },
    ]
  }
  if (typeof value.diffPreview !== "string") {
    return [stringIssue("patchProposal.diffPreview")]
  }
  return []
}

export function validatePatchArtifactInput(input: unknown): ValidatePatchArtifactResult {
  if (!isRecord(input)) {
    return { ok: false, issues: [{ path: "", message: "artifact must be an object" }] }
  }
  if (input.version !== PATCH_ARTIFACT_VERSION) {
    return {
      ok: false,
      issues: [
        { path: "version", message: `version must be ${PATCH_ARTIFACT_VERSION}` },
      ],
    }
  }
  if (typeof input.taskId !== "string") return { ok: false, issues: [stringIssue("taskId")] }
  if (typeof input.taskStatus !== "string") {
    return { ok: false, issues: [stringIssue("taskStatus")] }
  }
  if (!isRecord(input.project)) {
    return { ok: false, issues: [{ path: "project", message: "project must be an object" }] }
  }
  if (typeof input.project.projectId !== "string") {
    return { ok: false, issues: [stringIssue("project.projectId")] }
  }
  if (!isRecord(input.page)) {
    return { ok: false, issues: [{ path: "page", message: "page must be an object" }] }
  }
  if (typeof input.page.route !== "string") {
    return { ok: false, issues: [stringIssue("page.route")] }
  }

  const proposalIssues = validatePatchProposal(input.patchProposal)
  if (proposalIssues.length > 0) return { ok: false, issues: proposalIssues }

  const safetyIssues = validateSafety(input.safety)
  if (safetyIssues.length > 0) return { ok: false, issues: safetyIssues }

  const patchProposal = input.patchProposal as Record<string, unknown>
  const artifact: PatchArtifactPreviewInput = {
    version: PATCH_ARTIFACT_VERSION,
    taskId: input.taskId,
    taskStatus: input.taskStatus,
    project: { projectId: input.project.projectId },
    page: { route: input.page.route },
    patchProposal: {
      summary: patchProposal.summary as string,
      suggestedFiles: patchProposal.suggestedFiles as string[],
      diffPreview: patchProposal.diffPreview as string,
    },
    safety: {
      appliesPatch: false,
      writesFiles: false,
      requiresHumanReview: true,
    },
  }
  if (isRecord(input.patchReview) && typeof input.patchReview.status === "string") {
    artifact.patchReview = { status: input.patchReview.status }
  }
  return { ok: true, artifact }
}

export function formatPatchArtifactPreview(artifact: PatchArtifactPreviewInput): string {
  const suggestedFiles =
    artifact.patchProposal.suggestedFiles.length === 0
      ? ["- (none)"]
      : artifact.patchProposal.suggestedFiles.map((file) => `- ${file}`)
  return [
    `Task: ${artifact.taskId} [${artifact.taskStatus}]`,
    `Project: ${artifact.project.projectId}`,
    `Route: ${artifact.page.route}`,
    `Proposal: ${artifact.patchProposal.summary}`,
    "Suggested files:",
    ...suggestedFiles,
    `Review: ${artifact.patchReview?.status ?? "unreviewed"}`,
    "Diff preview:",
    artifact.patchProposal.diffPreview,
    "",
  ].join("\n")
}

function usage(): string {
  return "Usage: web-annotation preview --file <artifact.json>\n"
}

function issueText(issues: ValidationIssue[]): string {
  return issues.map((issue) => `${issue.path || "artifact"}: ${issue.message}`).join("\n")
}

export async function runPreviewCommand(
  args: string[],
  deps: PreviewCommandDependencies,
): Promise<PreviewCommandResult> {
  if (args[0] !== "preview") {
    return { code: 1, stdout: "", stderr: usage() }
  }
  const fileFlagIndex = args.indexOf("--file")
  const file = fileFlagIndex >= 0 ? args[fileFlagIndex + 1] : undefined
  if (!file) {
    return { code: 1, stdout: "", stderr: usage() }
  }

  let raw: string
  try {
    raw = await deps.readFile(file)
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error"
    return { code: 1, stdout: "", stderr: `Failed to read artifact file: ${message}\n` }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { code: 1, stdout: "", stderr: "Artifact file is not valid JSON\n" }
  }

  const result = validatePatchArtifactInput(parsed)
  if (!result.ok) {
    return { code: 1, stdout: "", stderr: `Invalid patch artifact:\n${issueText(result.issues)}\n` }
  }

  return { code: 0, stdout: formatPatchArtifactPreview(result.artifact), stderr: "" }
}

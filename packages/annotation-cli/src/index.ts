import { posix, win32 } from "node:path"

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

export interface ApplyDryRunCommandDependencies extends PreviewCommandDependencies {
  getRepoRoot: () => Promise<string>
  getGitStatus: () => Promise<string>
}

export interface PreviewCommandResult {
  code: number
  stdout: string
  stderr: string
}

export interface ApplyDryRunPlanInput {
  artifact: PatchArtifactPreviewInput
  repoRoot: string
  suggestedFiles: string[]
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

export function formatApplyDryRunPlan(input: ApplyDryRunPlanInput): string {
  const suggestedFiles =
    input.suggestedFiles.length === 0
      ? ["- (none)"]
      : input.suggestedFiles.map((file) => `- ${file}`)
  return [
    "Apply dry-run plan",
    `Task: ${input.artifact.taskId} [${input.artifact.taskStatus}]`,
    `Repo root: ${input.repoRoot}`,
    "Suggested files:",
    ...suggestedFiles,
    `Review: ${input.artifact.patchReview?.status ?? "unreviewed"}`,
    "Safety:",
    "- appliesPatch: false",
    "- writesFiles: false",
    "- createsCommit: false",
    "Diff preview:",
    input.artifact.patchProposal.diffPreview,
    "",
  ].join("\n")
}

function previewUsage(): string {
  return "Usage: web-annotation preview --file <artifact.json>\n"
}

function applyDryRunUsage(): string {
  return "Usage: web-annotation apply --file <artifact.json> --dry-run\n"
}

function cliUsage(): string {
  return [previewUsage().trimEnd(), applyDryRunUsage().trimEnd(), ""].join("\n")
}

function issueText(issues: ValidationIssue[]): string {
  return issues.map((issue) => `${issue.path || "artifact"}: ${issue.message}`).join("\n")
}

type ValidateSuggestedFilesResult =
  | { ok: true; suggestedFiles: string[] }
  | { ok: false; issues: ValidationIssue[] }

function getFileArg(args: string[]): string | undefined {
  const fileFlagIndex = args.indexOf("--file")
  return fileFlagIndex >= 0 ? args[fileFlagIndex + 1] : undefined
}

async function readAndValidateArtifact(
  file: string,
  deps: PreviewCommandDependencies,
): Promise<
  | { ok: true; artifact: PatchArtifactPreviewInput }
  | { ok: false; result: PreviewCommandResult }
> {
  let raw: string
  try {
    raw = await deps.readFile(file)
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error"
    return {
      ok: false,
      result: { code: 1, stdout: "", stderr: `Failed to read artifact file: ${message}\n` },
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {
      ok: false,
      result: { code: 1, stdout: "", stderr: "Artifact file is not valid JSON\n" },
    }
  }

  const result = validatePatchArtifactInput(parsed)
  if (!result.ok) {
    return {
      ok: false,
      result: {
        code: 1,
        stdout: "",
        stderr: `Invalid patch artifact:\n${issueText(result.issues)}\n`,
      },
    }
  }
  return { ok: true, artifact: result.artifact }
}

function validateSuggestedFiles(files: string[]): ValidateSuggestedFilesResult {
  const issues: ValidationIssue[] = []
  const suggestedFiles: string[] = []

  files.forEach((file, index) => {
    const path = `patchProposal.suggestedFiles[${index}]`
    const trimmed = file.trim()
    if (trimmed.length === 0) {
      issues.push({ path, message: "file must not be empty" })
      return
    }
    if (posix.isAbsolute(trimmed) || win32.isAbsolute(trimmed)) {
      issues.push({ path, message: "file must be relative" })
      return
    }
    const normalizedInput = trimmed.replace(/\\/g, "/")
    const segments = normalizedInput.split("/").filter(Boolean)
    if (segments.includes("..")) {
      issues.push({ path, message: "file must not contain .." })
      return
    }
    const normalized = posix.normalize(normalizedInput)
    if (normalized === "." || normalized.startsWith("../")) {
      issues.push({ path, message: "file must stay inside the repository" })
      return
    }
    suggestedFiles.push(normalized)
  })

  if (issues.length > 0) return { ok: false, issues }
  return { ok: true, suggestedFiles }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error"
}

export async function runPreviewCommand(
  args: string[],
  deps: PreviewCommandDependencies,
): Promise<PreviewCommandResult> {
  if (args[0] !== "preview") {
    return { code: 1, stdout: "", stderr: previewUsage() }
  }
  const file = getFileArg(args)
  if (!file) {
    return { code: 1, stdout: "", stderr: previewUsage() }
  }

  const result = await readAndValidateArtifact(file, deps)
  if (!result.ok) {
    return result.result
  }

  return { code: 0, stdout: formatPatchArtifactPreview(result.artifact), stderr: "" }
}

export async function runApplyDryRunCommand(
  args: string[],
  deps: ApplyDryRunCommandDependencies,
): Promise<PreviewCommandResult> {
  if (args[0] !== "apply" || !args.includes("--dry-run")) {
    return { code: 1, stdout: "", stderr: applyDryRunUsage() }
  }
  const file = getFileArg(args)
  if (!file) {
    return { code: 1, stdout: "", stderr: applyDryRunUsage() }
  }

  const artifactResult = await readAndValidateArtifact(file, deps)
  if (!artifactResult.ok) {
    return artifactResult.result
  }

  const suggestedFilesResult = validateSuggestedFiles(
    artifactResult.artifact.patchProposal.suggestedFiles,
  )
  if (!suggestedFilesResult.ok) {
    return {
      code: 1,
      stdout: "",
      stderr: `Invalid suggested files:\n${issueText(suggestedFilesResult.issues)}\n`,
    }
  }

  let repoRoot: string
  try {
    repoRoot = await deps.getRepoRoot()
    const status = await deps.getGitStatus()
    if (status.trim().length > 0) {
      return {
        code: 1,
        stdout: "",
        stderr: "Git preflight failed: working tree must be clean before dry-run\n",
      }
    }
  } catch (error) {
    return { code: 1, stdout: "", stderr: `Git preflight failed: ${errorMessage(error)}\n` }
  }

  return {
    code: 0,
    stdout: formatApplyDryRunPlan({
      artifact: artifactResult.artifact,
      repoRoot,
      suggestedFiles: suggestedFilesResult.suggestedFiles,
    }),
    stderr: "",
  }
}

export function runCliCommand(
  args: string[],
  deps: ApplyDryRunCommandDependencies,
): Promise<PreviewCommandResult> {
  if (args[0] === "preview") return runPreviewCommand(args, deps)
  if (args[0] === "apply") return runApplyDryRunCommand(args, deps)
  return Promise.resolve({ code: 1, stdout: "", stderr: cliUsage() })
}

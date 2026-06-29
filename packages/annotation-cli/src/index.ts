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

export interface ApplyCheckCommandDependencies extends ApplyDryRunCommandDependencies {
  checkPatch: (diffPreview: string) => Promise<void>
}

export interface ApplyConfirmedCommandDependencies extends ApplyCheckCommandDependencies {
  applyPatch: (diffPreview: string) => Promise<void>
  checkBranchName?: (branchName: string) => Promise<void>
  createBranch?: (branchName: string) => Promise<void>
  stageFiles?: (files: string[]) => Promise<void>
  commitChanges?: (message: string) => Promise<void>
}

export interface ApplyBranchCommitCommandDependencies extends ApplyConfirmedCommandDependencies {
  checkBranchName: (branchName: string) => Promise<void>
  createBranch: (branchName: string) => Promise<void>
  stageFiles: (files: string[]) => Promise<void>
  commitChanges: (message: string) => Promise<void>
}

export interface PullResponse {
  ok: boolean
  status: number
  text: () => Promise<string>
}

export interface PullCommandDependencies {
  fetchArtifact: (url: string, headers: Record<string, string>) => Promise<PullResponse>
  writeFile: (file: string, content: string) => Promise<void>
}

export interface CliCommandDependencies extends ApplyConfirmedCommandDependencies {
  fetchArtifact?: PullCommandDependencies["fetchArtifact"]
  writeFile?: PullCommandDependencies["writeFile"]
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

export type PatchCheckReportInput = ApplyDryRunPlanInput
export type ApplyReportInput = ApplyDryRunPlanInput
export interface BranchCommitReportInput extends ApplyDryRunPlanInput {
  branchName: string
}

export interface PullReportInput {
  artifact: PatchArtifactPreviewInput
  outFile: string
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

export function formatPatchCheckReport(input: PatchCheckReportInput): string {
  const suggestedFiles =
    input.suggestedFiles.length === 0
      ? ["- (none)"]
      : input.suggestedFiles.map((file) => `- ${file}`)
  return [
    "Patch check report",
    `Task: ${input.artifact.taskId} [${input.artifact.taskStatus}]`,
    `Repo root: ${input.repoRoot}`,
    "Suggested files:",
    ...suggestedFiles,
    `Review: ${input.artifact.patchReview?.status ?? "unreviewed"}`,
    "Patch check: passed",
    "Safety:",
    "- appliesPatch: false",
    "- writesFiles: false",
    "- createsCommit: false",
    "",
  ].join("\n")
}

export function formatApplyReport(input: ApplyReportInput): string {
  const suggestedFiles =
    input.suggestedFiles.length === 0
      ? ["- (none)"]
      : input.suggestedFiles.map((file) => `- ${file}`)
  return [
    "Patch apply report",
    `Task: ${input.artifact.taskId} [${input.artifact.taskStatus}]`,
    `Repo root: ${input.repoRoot}`,
    "Applied files:",
    ...suggestedFiles,
    `Review: ${input.artifact.patchReview?.status ?? "unreviewed"}`,
    "Patch check: passed",
    "Patch apply: applied",
    "Safety:",
    "- createsCommit: false",
    "",
  ].join("\n")
}

export function formatBranchCommitReport(input: BranchCommitReportInput): string {
  const suggestedFiles =
    input.suggestedFiles.length === 0
      ? ["- (none)"]
      : input.suggestedFiles.map((file) => `- ${file}`)
  return [
    "Patch branch commit report",
    `Task: ${input.artifact.taskId} [${input.artifact.taskStatus}]`,
    `Repo root: ${input.repoRoot}`,
    `Branch: ${input.branchName}`,
    "Committed files:",
    ...suggestedFiles,
    `Review: ${input.artifact.patchReview?.status ?? "unreviewed"}`,
    "Patch check: passed",
    "Patch apply: applied",
    "Git add: staged selected files",
    "Git commit: created",
    "Safety:",
    "- push: false",
    "- createsPr: false",
    "",
  ].join("\n")
}

export function formatPullReport(input: PullReportInput): string {
  const suggestedFiles =
    input.artifact.patchProposal.suggestedFiles.length === 0
      ? ["- (none)"]
      : input.artifact.patchProposal.suggestedFiles.map((file) => `- ${file}`)
  return [
    "Patch artifact pull report",
    `Task: ${input.artifact.taskId} [${input.artifact.taskStatus}]`,
    `Out file: ${input.outFile}`,
    "Suggested files:",
    ...suggestedFiles,
    `Review: ${input.artifact.patchReview?.status ?? "unreviewed"}`,
    "Safety:",
    "- appliesPatch: false",
    "- writesRepoFiles: false",
    "- createsCommit: false",
    "",
  ].join("\n")
}

function previewUsage(): string {
  return "Usage: web-annotation preview --file <artifact.json>\n"
}

function applyDryRunUsage(): string {
  return "Usage: web-annotation apply --file <artifact.json> --dry-run\n"
}

function applyCheckUsage(): string {
  return "Usage: web-annotation apply --file <artifact.json> --check\n"
}

function applyConfirmedUsage(): string {
  return [
    "Usage: web-annotation apply --file <artifact.json> --yes",
    "Run --dry-run or --check before confirmed apply.",
    "",
  ].join("\n")
}

function branchCommitUsage(): string {
  return "Usage: web-annotation apply --file <artifact.json> --yes --branch <branch-name> --commit --message <commit-message>\n"
}

function pullUsage(): string {
  return "Usage: web-annotation pull <task-id> --base-url <platform-url> --out <artifact.json> [--token <token>]\n"
}

function cliUsage(): string {
  return [
    previewUsage().trimEnd(),
    applyDryRunUsage().trimEnd(),
    applyCheckUsage().trimEnd(),
    applyConfirmedUsage().trimEnd(),
    branchCommitUsage().trimEnd(),
    pullUsage().trimEnd(),
    "",
  ].join("\n")
}

function issueText(issues: ValidationIssue[]): string {
  return issues.map((issue) => `${issue.path || "artifact"}: ${issue.message}`).join("\n")
}

type ValidateSuggestedFilesResult =
  | { ok: true; suggestedFiles: string[] }
  | { ok: false; issues: ValidationIssue[] }

function getFileArg(args: string[]): string | undefined {
  return getArg(args, "--file")
}

function getArg(args: string[], flag: string): string | undefined {
  const fileFlagIndex = args.indexOf("--file")
  if (flag === "--file") return fileFlagIndex >= 0 ? args[fileFlagIndex + 1] : undefined
  const flagIndex = args.indexOf(flag)
  return flagIndex >= 0 ? args[flagIndex + 1] : undefined
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

type NormalizeRepositoryFileResult =
  | { ok: true; file: string }
  | { ok: false; issue: ValidationIssue }

function normalizeRepositoryFile(file: string, path: string): NormalizeRepositoryFileResult {
  const trimmed = file.trim()
  if (trimmed.length === 0) {
    return { ok: false, issue: { path, message: "file must not be empty" } }
  }
  if (posix.isAbsolute(trimmed) || win32.isAbsolute(trimmed)) {
    return { ok: false, issue: { path, message: "file must be relative" } }
  }
  const normalizedInput = trimmed.replace(/\\/g, "/")
  const segments = normalizedInput.split("/").filter(Boolean)
  if (segments.includes("..")) {
    return { ok: false, issue: { path, message: "file must not contain .." } }
  }
  const normalized = posix.normalize(normalizedInput)
  if (normalized === "." || normalized.startsWith("../")) {
    return { ok: false, issue: { path, message: "file must stay inside the repository" } }
  }
  return { ok: true, file: normalized }
}

function validateSuggestedFiles(files: string[]): ValidateSuggestedFilesResult {
  const issues: ValidationIssue[] = []
  const suggestedFiles: string[] = []

  files.forEach((file, index) => {
    const result = normalizeRepositoryFile(file, `patchProposal.suggestedFiles[${index}]`)
    if (result.ok) {
      suggestedFiles.push(result.file)
      return
    }
    issues.push(result.issue)
  })

  if (issues.length > 0) return { ok: false, issues }
  return { ok: true, suggestedFiles }
}

type ValidateDiffFilesResult = { ok: true } | { ok: false; issues: ValidationIssue[] }

function parseHunkCounts(line: string): { remOld: number; remNew: number } {
  const match = /^@@+ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/.exec(line)
  if (!match) return { remOld: 1, remNew: 1 }
  const remOld = match[1] === undefined ? 1 : Number(match[1])
  const remNew = match[2] === undefined ? 1 : Number(match[2])
  return { remOld, remNew }
}

function diffHeaderPath(raw: string): string | null {
  const noTab = raw.split("\t")[0].replace(/\r$/, "").trim()
  if (noTab.length === 0 || noTab === "/dev/null") return null
  if (noTab.startsWith("a/") || noTab.startsWith("b/")) return noTab.slice(2)
  return noTab
}

/**
 * Enumerate every repository file that `git apply` would touch for this diff.
 * `git apply` accepts both `diff --git` extended headers and plain unified-diff
 * `---`/`+++` file headers, so a diff can declare extra targets beyond
 * `suggestedFiles`. Hunk bodies are skipped via exact line counts so that
 * content lines such as `--- something` are not misread as file headers.
 */
function collectDiffTargetPaths(diffPreview: string): string[] {
  const rawPaths: string[] = []
  const lines = diffPreview.split("\n")
  let inHunk = false
  let remOld = 0
  let remNew = 0
  let pendingMinus: string | null = null

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx]
    if (inHunk) {
      if (line.startsWith("@@")) {
        const counts = parseHunkCounts(line)
        remOld = counts.remOld
        remNew = counts.remNew
        inHunk = remOld > 0 || remNew > 0
        continue
      }
      const marker = line.charAt(0)
      if (marker === " ") {
        remOld--
        remNew--
      } else if (marker === "+") {
        remNew--
      } else if (marker === "-") {
        remOld--
      } else if (marker === "\\") {
        // "\ No newline at end of file" is not a counted hunk line.
      } else {
        // Not valid hunk content: the hunk ended early, reprocess as a header.
        inHunk = false
        idx--
        continue
      }
      if (remOld <= 0 && remNew <= 0) inHunk = false
      continue
    }

    if (line.startsWith("@@")) {
      const counts = parseHunkCounts(line)
      remOld = counts.remOld
      remNew = counts.remNew
      inHunk = remOld > 0 || remNew > 0
      pendingMinus = null
      continue
    }
    const gitHeader = /^diff --git a\/(.+) b\/(.+)$/.exec(line)
    if (gitHeader) {
      rawPaths.push(gitHeader[1], gitHeader[2])
      pendingMinus = null
      continue
    }
    if (line.startsWith("--- ")) {
      pendingMinus = line.slice(4)
      continue
    }
    if (line.startsWith("+++ ")) {
      if (pendingMinus !== null) {
        const minusPath = diffHeaderPath(pendingMinus)
        if (minusPath !== null) rawPaths.push(minusPath)
        pendingMinus = null
      }
      const plusPath = diffHeaderPath(line.slice(4))
      if (plusPath !== null) rawPaths.push(plusPath)
      continue
    }
    pendingMinus = null
  }

  return rawPaths
}

function extractDiffFiles(diffPreview: string):
  | { ok: true; files: string[] }
  | { ok: false; issues: ValidationIssue[] } {
  const files = new Set<string>()
  const issues: ValidationIssue[] = []

  for (const rawPath of collectDiffTargetPaths(diffPreview)) {
    const result = normalizeRepositoryFile(rawPath, "patchProposal.diffPreview")
    if (result.ok) {
      files.add(result.file)
      continue
    }
    issues.push(result.issue)
  }

  if (issues.length > 0) return { ok: false, issues }
  if (files.size === 0) {
    return {
      ok: false,
      issues: [
        {
          path: "patchProposal.diffPreview",
          message: "diff must include file headers that target repository files",
        },
      ],
    }
  }

  return { ok: true, files: [...files].sort() }
}

function validateDiffFilesMatchSuggested(
  diffPreview: string,
  suggestedFiles: string[],
): ValidateDiffFilesResult {
  const diffFilesResult = extractDiffFiles(diffPreview)
  if (!diffFilesResult.ok) return diffFilesResult

  const diffFiles = diffFilesResult.files
  const suggested = [...new Set(suggestedFiles)].sort()
  const missing = suggested.filter((file) => !diffFiles.includes(file))
  const extra = diffFiles.filter((file) => !suggested.includes(file))

  if (missing.length === 0 && extra.length === 0) return { ok: true }
  return {
    ok: false,
    issues: [
      {
        path: "patchProposal.diffPreview",
        message: `diff files must match suggestedFiles (missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"})`,
      },
    ],
  }
}

function validateBranchNameInput(branchName: string): string | undefined {
  if (branchName.length === 0 || branchName.trim() !== branchName) {
    return "branch name must not be empty or padded with whitespace"
  }
  if (/\s/.test(branchName)) return "branch name must not contain whitespace"
  if (branchName.startsWith("-")) return "branch name must not start with -"
  if (branchName.includes("..")) return "branch name must not contain .."
  if (branchName.includes("\\")) return "branch name must not contain backslashes"
  return undefined
}

function validateCommitMessageInput(message: string): string | undefined {
  if (message.trim().length === 0) return "message must not be empty"
  if (/Co-Authored-By|Generated with/i.test(message)) {
    return "message must not contain AI signature trailers"
  }
  return undefined
}

function hasBranchCommitDependencies(
  deps: ApplyConfirmedCommandDependencies,
): deps is ApplyBranchCommitCommandDependencies {
  return (
    typeof deps.checkBranchName === "function" &&
    typeof deps.createBranch === "function" &&
    typeof deps.stageFiles === "function" &&
    typeof deps.commitChanges === "function"
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error"
}

function redactToken(message: string, token: string | undefined): string {
  if (!token) return message
  return message.split(token).join("[redacted]")
}

async function prepareApplyCommand(
  file: string,
  deps: ApplyDryRunCommandDependencies,
  dirtyMessage: string,
): Promise<
  | { ok: true; artifact: PatchArtifactPreviewInput; repoRoot: string; suggestedFiles: string[] }
  | { ok: false; result: PreviewCommandResult }
> {
  const artifactResult = await readAndValidateArtifact(file, deps)
  if (!artifactResult.ok) return artifactResult

  const suggestedFilesResult = validateSuggestedFiles(
    artifactResult.artifact.patchProposal.suggestedFiles,
  )
  if (!suggestedFilesResult.ok) {
    return {
      ok: false,
      result: {
        code: 1,
        stdout: "",
        stderr: `Invalid suggested files:\n${issueText(suggestedFilesResult.issues)}\n`,
      },
    }
  }

  try {
    const repoRoot = await deps.getRepoRoot()
    const status = await deps.getGitStatus()
    if (status.trim().length > 0) {
      return {
        ok: false,
        result: { code: 1, stdout: "", stderr: dirtyMessage },
      }
    }
    const diffFilesResult = validateDiffFilesMatchSuggested(
      artifactResult.artifact.patchProposal.diffPreview,
      suggestedFilesResult.suggestedFiles,
    )
    if (!diffFilesResult.ok) {
      return {
        ok: false,
        result: {
          code: 1,
          stdout: "",
          stderr: `Patch diff files must match suggested files:\n${issueText(diffFilesResult.issues)}\n`,
        },
      }
    }
    return {
      ok: true,
      artifact: artifactResult.artifact,
      repoRoot,
      suggestedFiles: suggestedFilesResult.suggestedFiles,
    }
  } catch (error) {
    return {
      ok: false,
      result: { code: 1, stdout: "", stderr: `Git preflight failed: ${errorMessage(error)}\n` },
    }
  }
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

  const prepared = await prepareApplyCommand(
    file,
    deps,
    "Git preflight failed: working tree must be clean before dry-run\n",
  )
  if (!prepared.ok) {
    return prepared.result
  }

  return {
    code: 0,
    stdout: formatApplyDryRunPlan({
      artifact: prepared.artifact,
      repoRoot: prepared.repoRoot,
      suggestedFiles: prepared.suggestedFiles,
    }),
    stderr: "",
  }
}

export async function runApplyCheckCommand(
  args: string[],
  deps: ApplyCheckCommandDependencies,
): Promise<PreviewCommandResult> {
  if (args[0] !== "apply" || !args.includes("--check")) {
    return { code: 1, stdout: "", stderr: applyCheckUsage() }
  }
  const file = getFileArg(args)
  if (!file) {
    return { code: 1, stdout: "", stderr: applyCheckUsage() }
  }

  const prepared = await prepareApplyCommand(
    file,
    deps,
    "Git preflight failed: working tree must be clean before patch check\n",
  )
  if (!prepared.ok) {
    return prepared.result
  }

  try {
    await deps.checkPatch(prepared.artifact.patchProposal.diffPreview)
  } catch (error) {
    return { code: 1, stdout: "", stderr: `Patch check failed: ${errorMessage(error)}\n` }
  }

  return {
    code: 0,
    stdout: formatPatchCheckReport({
      artifact: prepared.artifact,
      repoRoot: prepared.repoRoot,
      suggestedFiles: prepared.suggestedFiles,
    }),
    stderr: "",
  }
}

export async function runApplyConfirmedCommand(
  args: string[],
  deps: ApplyConfirmedCommandDependencies,
): Promise<PreviewCommandResult> {
  if (args[0] !== "apply" || !args.includes("--yes")) {
    return { code: 1, stdout: "", stderr: applyConfirmedUsage() }
  }
  const file = getFileArg(args)
  if (!file) {
    return { code: 1, stdout: "", stderr: applyConfirmedUsage() }
  }
  const commitMode =
    args.includes("--commit") || args.includes("--branch") || args.includes("--message")
  if (commitMode) {
    const branchName = getArg(args, "--branch")
    const commitMessage = getArg(args, "--message")
    if (!args.includes("--commit") || !branchName || !commitMessage) {
      return { code: 1, stdout: "", stderr: branchCommitUsage() }
    }
    const branchError = validateBranchNameInput(branchName)
    if (branchError) {
      return { code: 1, stdout: "", stderr: `Invalid branch name: ${branchError}\n` }
    }
    const messageError = validateCommitMessageInput(commitMessage)
    if (messageError) {
      return { code: 1, stdout: "", stderr: `Invalid commit message: ${messageError}\n` }
    }
    if (!hasBranchCommitDependencies(deps)) {
      return {
        code: 1,
        stdout: "",
        stderr: "Branch commit dependencies are not configured\n",
      }
    }

    const prepared = await prepareApplyCommand(
      file,
      deps,
      "Git preflight failed: working tree must be clean before confirmed apply\n",
    )
    if (!prepared.ok) {
      return prepared.result
    }

    try {
      await deps.checkPatch(prepared.artifact.patchProposal.diffPreview)
    } catch (error) {
      return { code: 1, stdout: "", stderr: `Patch check failed: ${errorMessage(error)}\n` }
    }

    try {
      await deps.checkBranchName(branchName)
    } catch (error) {
      return { code: 1, stdout: "", stderr: `Branch validation failed: ${errorMessage(error)}\n` }
    }

    try {
      await deps.createBranch(branchName)
    } catch (error) {
      return { code: 1, stdout: "", stderr: `Git branch failed: ${errorMessage(error)}\n` }
    }

    try {
      await deps.applyPatch(prepared.artifact.patchProposal.diffPreview)
    } catch (error) {
      return { code: 1, stdout: "", stderr: `Patch apply failed: ${errorMessage(error)}\n` }
    }

    try {
      await deps.stageFiles(prepared.suggestedFiles)
    } catch (error) {
      return { code: 1, stdout: "", stderr: `Git add failed: ${errorMessage(error)}\n` }
    }

    try {
      await deps.commitChanges(commitMessage)
    } catch (error) {
      return { code: 1, stdout: "", stderr: `Git commit failed: ${errorMessage(error)}\n` }
    }

    return {
      code: 0,
      stdout: formatBranchCommitReport({
        artifact: prepared.artifact,
        repoRoot: prepared.repoRoot,
        suggestedFiles: prepared.suggestedFiles,
        branchName,
      }),
      stderr: "",
    }
  }

  const prepared = await prepareApplyCommand(
    file,
    deps,
    "Git preflight failed: working tree must be clean before confirmed apply\n",
  )
  if (!prepared.ok) {
    return prepared.result
  }

  try {
    await deps.checkPatch(prepared.artifact.patchProposal.diffPreview)
  } catch (error) {
    return { code: 1, stdout: "", stderr: `Patch check failed: ${errorMessage(error)}\n` }
  }

  try {
    await deps.applyPatch(prepared.artifact.patchProposal.diffPreview)
  } catch (error) {
    return { code: 1, stdout: "", stderr: `Patch apply failed: ${errorMessage(error)}\n` }
  }

  return {
    code: 0,
    stdout: formatApplyReport({
      artifact: prepared.artifact,
      repoRoot: prepared.repoRoot,
      suggestedFiles: prepared.suggestedFiles,
    }),
    stderr: "",
  }
}

function buildArtifactUrl(baseUrl: string, taskId: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "")
  return `${trimmed}/api/tasks/${encodeURIComponent(taskId)}/patch-artifact`
}

/**
 * The platform export endpoint wraps the artifact as `{ artifact }`; accept both
 * that documented shape and a bare artifact object so the same validator applies.
 */
function extractArtifactPayload(parsed: unknown): unknown {
  if (isRecord(parsed) && isRecord(parsed.artifact)) return parsed.artifact
  return parsed
}

export async function runPullCommand(
  args: string[],
  deps: PullCommandDependencies,
): Promise<PreviewCommandResult> {
  if (args[0] !== "pull") {
    return { code: 1, stdout: "", stderr: pullUsage() }
  }
  const taskId = args[1]
  const baseUrl = getArg(args, "--base-url")
  const outFile = getArg(args, "--out")
  if (!taskId || taskId.startsWith("--") || !baseUrl || !outFile) {
    return { code: 1, stdout: "", stderr: pullUsage() }
  }

  let parsedBase: URL
  try {
    parsedBase = new URL(baseUrl)
  } catch {
    return { code: 1, stdout: "", stderr: "Invalid base URL: must be an http: or https: URL\n" }
  }
  if (parsedBase.protocol !== "http:" && parsedBase.protocol !== "https:") {
    return { code: 1, stdout: "", stderr: "Invalid base URL: must be an http: or https: URL\n" }
  }

  const token = getArg(args, "--token")
  const headers: Record<string, string> = { accept: "application/json" }
  if (token) headers.authorization = `Bearer ${token}`

  const url = buildArtifactUrl(baseUrl, taskId)

  let response: PullResponse
  try {
    response = await deps.fetchArtifact(url, headers)
  } catch (error) {
    return {
      code: 1,
      stdout: "",
      stderr: `Pull request failed: ${redactToken(errorMessage(error), token)}\n`,
    }
  }

  if (!response.ok) {
    return {
      code: 1,
      stdout: "",
      stderr: `Pull failed: artifact request returned HTTP ${response.status}\n`,
    }
  }

  let raw: string
  try {
    raw = await response.text()
  } catch (error) {
    return {
      code: 1,
      stdout: "",
      stderr: `Pull request failed: ${redactToken(errorMessage(error), token)}\n`,
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { code: 1, stdout: "", stderr: "Pull response is not valid JSON\n" }
  }

  const payload = extractArtifactPayload(parsed)
  const validation = validatePatchArtifactInput(payload)
  if (!validation.ok) {
    return {
      code: 1,
      stdout: "",
      stderr: `Invalid patch artifact:\n${issueText(validation.issues)}\n`,
    }
  }

  try {
    await deps.writeFile(outFile, `${JSON.stringify(payload, null, 2)}\n`)
  } catch (error) {
    return {
      code: 1,
      stdout: "",
      stderr: `Failed to write artifact file: ${redactToken(errorMessage(error), token)}\n`,
    }
  }

  return {
    code: 0,
    stdout: formatPullReport({ artifact: validation.artifact, outFile }),
    stderr: "",
  }
}

export function runCliCommand(
  args: string[],
  deps: CliCommandDependencies,
): Promise<PreviewCommandResult> {
  if (args[0] === "preview") return runPreviewCommand(args, deps)
  if (args[0] === "pull") {
    if (!deps.fetchArtifact || !deps.writeFile) {
      return Promise.resolve({
        code: 1,
        stdout: "",
        stderr: "Pull dependencies are not configured\n",
      })
    }
    return runPullCommand(args, { fetchArtifact: deps.fetchArtifact, writeFile: deps.writeFile })
  }
  if (args[0] === "apply" && args.includes("--yes")) return runApplyConfirmedCommand(args, deps)
  if (args[0] === "apply" && args.includes("--check")) return runApplyCheckCommand(args, deps)
  if (args[0] === "apply" && args.includes("--dry-run")) return runApplyDryRunCommand(args, deps)
  if (args[0] === "apply") return runApplyConfirmedCommand(args, deps)
  return Promise.resolve({ code: 1, stdout: "", stderr: cliUsage() })
}

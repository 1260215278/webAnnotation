import { posix, win32 } from "node:path"
import type { ValidationIssue } from "./types"

/** Result of collecting the repository files a unified diff would touch. */
export type CollectUnifiedDiffTargetFilesResult =
  | { ok: true; files: string[] }
  | { ok: false; issues: ValidationIssue[] }

/** Result of validating diff target files against an allow-list. */
export type ValidateUnifiedDiffTargetFilesResult =
  | { ok: true; files: string[] }
  | { ok: false; issues: ValidationIssue[] }

const DIFF_PATH = "diffPreview"

type NormalizeRepositoryFileResult =
  | { ok: true; file: string }
  | { ok: false; issue: ValidationIssue }

/**
 * Normalize a diff-supplied path and reject anything that would let a patch
 * escape the repository: empty names, absolute paths, and `..` traversal.
 */
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
 * `---`/`+++` file headers, so a diff can declare extra targets beyond an
 * allow-list. Hunk bodies are skipped via exact line counts so that content
 * lines such as `--- something` are not misread as file headers. `/dev/null`
 * headers (added/deleted files) are ignored, keeping only the real path.
 */
function collectDiffTargetPaths(diff: string): string[] {
  const rawPaths: string[] = []
  const lines = diff.split("\n")
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

/**
 * Collect the repository files a unified diff targets. Supports both
 * `diff --git a/file b/file` headers and plain `--- a/file` / `+++ b/file`
 * headers, skips hunk bodies, and ignores `/dev/null`. Returns sorted, unique
 * relative paths on success, or readable issues when a target is empty,
 * absolute, escapes the repository, or no file header is present. Never runs
 * git, applies the patch, or reads repository files.
 */
export function collectUnifiedDiffTargetFiles(diff: string): CollectUnifiedDiffTargetFilesResult {
  const files = new Set<string>()
  const issues: ValidationIssue[] = []

  for (const rawPath of collectDiffTargetPaths(diff)) {
    const result = normalizeRepositoryFile(rawPath, DIFF_PATH)
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
        { path: DIFF_PATH, message: "diff must include file headers that target repository files" },
      ],
    }
  }

  return { ok: true, files: [...files].sort() }
}

/**
 * Validate that every file a unified diff targets is contained in
 * `allowedFiles`. Use this to stop an external provider's `diffPreview` from
 * touching files outside its declared `suggestedFiles`. Returns the sorted diff
 * target files on success, or readable issues when a target is unsafe (empty,
 * absolute, traversal) or falls outside the allow-list.
 */
export function validateUnifiedDiffTargetFiles(
  diff: string,
  allowedFiles: string[],
): ValidateUnifiedDiffTargetFilesResult {
  const collected = collectUnifiedDiffTargetFiles(diff)
  if (!collected.ok) return collected

  const allowed = new Set<string>()
  for (const file of allowedFiles) {
    const result = normalizeRepositoryFile(file, DIFF_PATH)
    if (result.ok) allowed.add(result.file)
  }

  const extra = collected.files.filter((file) => !allowed.has(file))
  if (extra.length > 0) {
    return {
      ok: false,
      issues: [
        {
          path: DIFF_PATH,
          message: `diff targets files outside the allow-list: ${extra.join(", ")}`,
        },
      ],
    }
  }

  return { ok: true, files: collected.files }
}

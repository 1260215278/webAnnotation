import { existsSync, readFileSync } from "node:fs"
import { isAbsolute, relative, resolve } from "node:path"
import type { PatchPromptContext } from "./types"

export interface RepoSourceContextOptions {
  /** Absolute path to the repository root. Required. All reads are confined here. */
  rootDir: string
  /** Lines of context to include before/after the annotated line(s). Default 20. */
  contextLines?: number
  /** Maximum number of distinct files to read. Default 8. */
  maxFiles?: number
  /** Skip files larger than this many bytes. Default 64 KiB. */
  maxBytesPerFile?: number
  /** Injectable file reader (for tests). Receives an absolute path. Defaults to `fs.readFileSync`. */
  readFile?: (absolutePath: string) => string
  /** Injectable existence check (for tests). Receives an absolute path. Defaults to `fs.existsSync`. */
  fileExists?: (absolutePath: string) => boolean
}

export interface RepoSourceFileAnnotation {
  annotationId: string
  line?: number
  column?: number
  component?: string
  message: string
}

export interface RepoSourceFile {
  /** Repository-relative, prompt-facing path. Never an absolute path. */
  file: string
  /** 1-based first line of the included snippet. */
  startLine: number
  /** 1-based last line of the included snippet. */
  endLine: number
  /** The source snippet text. */
  content: string
  /** Annotations that referenced this file. */
  annotations: RepoSourceFileAnnotation[]
}

export interface RepoSourceIssue {
  code:
    | "empty_path"
    | "unsafe_path"
    | "invalid_root"
    | "absolute_path"
    | "path_escape"
    | "not_found"
    | "too_large"
    | "binary"
    | "read_error"
    | "max_files_exceeded"
  message: string
  file?: string
  annotationId?: string
}

export interface RepoSourceContext {
  files: RepoSourceFile[]
  issues: RepoSourceIssue[]
}

function toNonNegativeInt(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback
  const normalized = Math.floor(value)
  return normalized < 0 ? 0 : normalized
}

function toPositiveInt(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback
  const normalized = Math.floor(value)
  return normalized > 0 ? normalized : fallback
}

type PathSafety =
  | { ok: true; absolutePath: string }
  | { ok: false; code: RepoSourceIssue["code"]; message: string }

function isWindowsAbsolutePath(file: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(file) || file.startsWith("\\\\")
}

/**
 * Validate that a prompt-supplied relative path stays inside `rootDir`. Absolute
 * paths, empty paths, null bytes, and `..` traversal that escapes the root are
 * rejected. The returned `absolutePath` is for internal reads only and is never
 * surfaced in prompt-facing output.
 */
function checkPathSafety(rootDir: string, file: string): PathSafety {
  if (file.trim() === "") {
    return { ok: false, code: "empty_path", message: "empty source path" }
  }
  if (file.indexOf("\u0000") !== -1) {
    return { ok: false, code: "unsafe_path", message: "source path contains a null byte" }
  }
  if (isAbsolute(file) || isWindowsAbsolutePath(file)) {
    return { ok: false, code: "absolute_path", message: `absolute path rejected: ${file}` }
  }
  const root = resolve(rootDir)
  const absolutePath = resolve(root, file)
  const rel = relative(root, absolutePath)
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    return { ok: false, code: "path_escape", message: `path escapes rootDir: ${file}` }
  }
  return { ok: true, absolutePath }
}

function sliceLines(
  content: string,
  annotations: RepoSourceFileAnnotation[],
  contextLines: number,
): { startLine: number; endLine: number; content: string } {
  const lines = content.split(/\r\n|\r|\n/)
  const total = lines.length
  const definedLines = annotations
    .map((annotation) => annotation.line)
    .filter((line): line is number => typeof line === "number" && line > 0)

  let startLine: number
  let endLine: number
  if (definedLines.length > 0) {
    const minLine = Math.min(...definedLines)
    const maxLine = Math.max(...definedLines)
    startLine = Math.max(1, minLine - contextLines)
    endLine = Math.min(total, maxLine + contextLines)
  } else {
    // No line info: read a limited slice from the top of the file.
    startLine = 1
    endLine = Math.min(total, Math.max(1, contextLines))
  }

  if (startLine > total) startLine = total
  if (endLine < startLine) endLine = startLine

  return {
    startLine,
    endLine,
    content: lines.slice(startLine - 1, endLine).join("\n"),
  }
}

/**
 * Read repository source snippets referenced by a prompt context's
 * `annotations[].source.file`. Pure helper for a future AI patch step: it does not
 * call any AI, generate diffs, or modify files. Unsafe paths, missing/oversized/
 * binary files, and over-budget reads are reported as `issues` rather than thrown.
 */
export function collectRepoSourceContext(
  promptContext: PatchPromptContext,
  options: RepoSourceContextOptions,
): RepoSourceContext {
  const issues: RepoSourceIssue[] = []
  const files: RepoSourceFile[] = []

  if (!isAbsolute(options.rootDir)) {
    return {
      files,
      issues: [
        {
          code: "invalid_root",
          message: "rootDir must be an absolute path",
        },
      ],
    }
  }

  const contextLines = toNonNegativeInt(options.contextLines, 20)
  const maxFiles = toNonNegativeInt(options.maxFiles, 8)
  const maxBytesPerFile = toPositiveInt(options.maxBytesPerFile, 64 * 1024)
  const fileExists = options.fileExists ?? ((path) => existsSync(path))
  const readFile = options.readFile ?? ((path) => readFileSync(path, "utf8"))

  // Group annotations by their relative source file, preserving first-seen order.
  const order: string[] = []
  const grouped = new Map<string, RepoSourceFileAnnotation[]>()
  for (const annotation of promptContext.annotations) {
    const file = annotation.source?.file
    if (!file) continue
    let bucket = grouped.get(file)
    if (!bucket) {
      bucket = []
      grouped.set(file, bucket)
      order.push(file)
    }
    bucket.push({
      annotationId: annotation.id,
      line: annotation.source?.line,
      column: annotation.source?.column,
      component: annotation.source?.component,
      message: annotation.message,
    })
  }

  let readCount = 0
  for (const file of order) {
    const annotations = grouped.get(file) ?? []

    const safety = checkPathSafety(options.rootDir, file)
    if (!safety.ok) {
      issues.push({ code: safety.code, message: safety.message, file })
      continue
    }

    if (readCount >= maxFiles) {
      issues.push({
        code: "max_files_exceeded",
        message: `skipped "${file}": exceeds maxFiles=${maxFiles}`,
        file,
      })
      continue
    }

    if (!fileExists(safety.absolutePath)) {
      issues.push({ code: "not_found", message: `file not found: ${file}`, file })
      continue
    }

    let content: string
    try {
      content = readFile(safety.absolutePath)
    } catch {
      issues.push({ code: "read_error", message: `could not read file: ${file}`, file })
      continue
    }

    if (Buffer.byteLength(content, "utf8") > maxBytesPerFile) {
      issues.push({
        code: "too_large",
        message: `file exceeds maxBytesPerFile=${maxBytesPerFile}: ${file}`,
        file,
      })
      continue
    }
    if (content.indexOf("\u0000") !== -1) {
      issues.push({ code: "binary", message: `binary file skipped: ${file}`, file })
      continue
    }

    readCount += 1
    const slice = sliceLines(content, annotations, contextLines)
    files.push({
      file,
      startLine: slice.startLine,
      endLine: slice.endLine,
      content: slice.content,
      annotations,
    })
  }

  return { files, issues }
}

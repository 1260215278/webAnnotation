import type { AnnotationPayload } from "@web-annotation/core"
import { isImageAttachmentMimeType } from "@web-annotation/core"
import type {
  SourceManifest,
  ValidateManifestResult,
  ValidatePayloadResult,
  ValidationIssue,
} from "./types"

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Short, human-readable description of a value's runtime type. */
function describe(value: unknown): string {
  if (value === null) return "null"
  if (Array.isArray(value)) return "array"
  return typeof value
}

function reqString(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "string") {
    issues.push({ path, message: `expected string, got ${describe(value)}` })
  }
}

function optString(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value !== undefined && typeof value !== "string") {
    issues.push({ path, message: `expected string or undefined, got ${describe(value)}` })
  }
}

function reqNumber(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issues.push({ path, message: `expected finite number, got ${describe(value)}` })
  }
}

function reqPositiveInteger(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    issues.push({ path, message: `expected positive integer, got ${describe(value)}` })
  }
}

function optPositiveInteger(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value !== undefined && (typeof value !== "number" || !Number.isInteger(value) || value <= 0)) {
    issues.push({
      path,
      message: `expected positive integer or undefined, got ${describe(value)}`,
    })
  }
}

function reqNonEmptyString(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "string") {
    issues.push({ path, message: `expected string, got ${describe(value)}` })
    return
  }
  if (value.trim() === "") {
    issues.push({ path, message: "must not be empty" })
  }
}

function optNonEmptyString(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value === undefined) return
  if (typeof value !== "string") {
    issues.push({ path, message: `expected string or undefined, got ${describe(value)}` })
    return
  }
  if (value.trim() === "") {
    issues.push({ path, message: "must not be empty" })
  }
}

function validateProject(value: unknown, issues: ValidationIssue[]): void {
  if (value === undefined) {
    issues.push({ path: "project", message: "missing required field" })
    return
  }
  if (!isObject(value)) {
    issues.push({ path: "project", message: `expected object, got ${describe(value)}` })
    return
  }
  reqString(value.projectId, "project.projectId", issues)
  optString(value.environment, "project.environment", issues)
  optString(value.release, "project.release", issues)
  optString(value.commit, "project.commit", issues)
}

function validateViewport(value: unknown, issues: ValidationIssue[]): void {
  if (value === undefined) {
    issues.push({ path: "page.viewport", message: "missing required field" })
    return
  }
  if (!isObject(value)) {
    issues.push({ path: "page.viewport", message: `expected object, got ${describe(value)}` })
    return
  }
  reqNumber(value.width, "page.viewport.width", issues)
  reqNumber(value.height, "page.viewport.height", issues)
}

function validatePage(value: unknown, issues: ValidationIssue[]): void {
  if (value === undefined) {
    issues.push({ path: "page", message: "missing required field" })
    return
  }
  if (!isObject(value)) {
    issues.push({ path: "page", message: `expected object, got ${describe(value)}` })
    return
  }
  reqString(value.url, "page.url", issues)
  reqString(value.route, "page.route", issues)
  reqString(value.title, "page.title", issues)
  validateViewport(value.viewport, issues)
}

function validateGroup(value: unknown, issues: ValidationIssue[]): void {
  if (value === undefined) {
    issues.push({ path: "annotationGroup", message: "missing required field" })
    return
  }
  if (!isObject(value)) {
    issues.push({ path: "annotationGroup", message: `expected object, got ${describe(value)}` })
    return
  }
  reqString(value.id, "annotationGroup.id", issues)
  if (value.mode !== "single" && value.mode !== "batch") {
    issues.push({
      path: "annotationGroup.mode",
      message: `expected "single" | "batch", got ${describe(value.mode)}`,
    })
  }
}

function validateSource(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isObject(value)) {
    issues.push({ path, message: `expected object, got ${describe(value)}` })
    return
  }
  if (value.mode !== "source" && value.mode !== "safe") {
    issues.push({
      path: `${path}.mode`,
      message: `expected "source" | "safe", got ${describe(value.mode)}`,
    })
  }
  optString(value.framework, `${path}.framework`, issues)
  optString(value.file, `${path}.file`, issues)
  optString(value.component, `${path}.component`, issues)
  optString(value.sourceId, `${path}.sourceId`, issues)
  optPositiveInteger(value.line, `${path}.line`, issues)
  optPositiveInteger(value.column, `${path}.column`, issues)
}

function validateRect(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value === undefined) {
    issues.push({ path, message: "missing required field" })
    return
  }
  if (!isObject(value)) {
    issues.push({ path, message: `expected object, got ${describe(value)}` })
    return
  }
  reqNumber(value.x, `${path}.x`, issues)
  reqNumber(value.y, `${path}.y`, issues)
  reqNumber(value.width, `${path}.width`, issues)
  reqNumber(value.height, `${path}.height`, issues)
}

function validateTarget(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value === undefined) {
    issues.push({ path, message: "missing required field" })
    return
  }
  if (!isObject(value)) {
    issues.push({ path, message: `expected object, got ${describe(value)}` })
    return
  }
  reqString(value.selector, `${path}.selector`, issues)
  reqString(value.cssPath, `${path}.cssPath`, issues)
  reqString(value.tagName, `${path}.tagName`, issues)
  reqString(value.text, `${path}.text`, issues)
  validateRect(value.rect, `${path}.rect`, issues)
  optString(value.domSnapshot, `${path}.domSnapshot`, issues)
  if (value.source !== undefined) {
    validateSource(value.source, `${path}.source`, issues)
  }
}

/**
 * Keys that would smuggle raw image content into a payload that is meant to
 * carry only a reference to an already-uploaded object.
 */
const FORBIDDEN_ATTACHMENT_KEYS = ["data", "base64", "content", "dataUrl", "bytes", "buffer", "blob"]

/**
 * Find the path of the first forbidden raw-content key anywhere inside the
 * attachment subtree (top level, `storage`, `metadata`, nested objects/arrays),
 * so raw bytes cannot be smuggled one level down from the top-level guard.
 */
function findForbiddenContentPath(value: unknown, base: string): string | undefined {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      const found = findForbiddenContentPath(value[index], `${base}[${index}]`)
      if (found) return found
    }
    return undefined
  }
  if (isObject(value)) {
    for (const key of Object.keys(value)) {
      const childPath = `${base}.${key}`
      if (FORBIDDEN_ATTACHMENT_KEYS.includes(key)) return childPath
      const found = findForbiddenContentPath(value[key], childPath)
      if (found) return found
    }
  }
  return undefined
}

/** Reject a storage reference that inlines raw bytes via a `data:` URL. */
function rejectDataUrl(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value === "string" && /^\s*data:/i.test(value)) {
    issues.push({ path, message: "must not be a data: URL carrying raw image content" })
  }
}

function validateAttachmentStorage(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value === undefined) {
    issues.push({ path, message: "missing required field" })
    return
  }
  if (!isObject(value)) {
    issues.push({ path, message: `expected object, got ${describe(value)}` })
    return
  }
  if (value.provider !== "server" && value.provider !== "oss" && value.provider !== "custom") {
    issues.push({
      path: `${path}.provider`,
      message: `expected "server" | "oss" | "custom", got ${describe(value.provider)}`,
    })
  }
  optNonEmptyString(value.url, `${path}.url`, issues)
  optNonEmptyString(value.objectKey, `${path}.objectKey`, issues)
  optNonEmptyString(value.uploadId, `${path}.uploadId`, issues)
  rejectDataUrl(value.url, `${path}.url`, issues)
  rejectDataUrl(value.objectKey, `${path}.objectKey`, issues)
  const hasUrl = typeof value.url === "string" && value.url.trim() !== ""
  const hasObjectKey = typeof value.objectKey === "string" && value.objectKey.trim() !== ""
  if (!hasUrl && !hasObjectKey) {
    issues.push({
      path,
      message: "must reference an uploaded image via a non-empty url or objectKey",
    })
  }
}

function validateAttachmentItem(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isObject(value)) {
    issues.push({ path, message: `expected object, got ${describe(value)}` })
    return
  }
  if (value.kind !== "image") {
    issues.push({ path: `${path}.kind`, message: `expected "image", got ${describe(value.kind)}` })
  }
  reqNonEmptyString(value.id, `${path}.id`, issues)
  reqNonEmptyString(value.name, `${path}.name`, issues)
  reqNonEmptyString(value.mimeType, `${path}.mimeType`, issues)
  if (typeof value.mimeType === "string" && value.mimeType.trim() !== "" &&
    !isImageAttachmentMimeType(value.mimeType)) {
    issues.push({
      path: `${path}.mimeType`,
      message: `unsupported image type ${JSON.stringify(value.mimeType)}`,
    })
  }
  reqPositiveInteger(value.size, `${path}.size`, issues)
  optPositiveInteger(value.width, `${path}.width`, issues)
  optPositiveInteger(value.height, `${path}.height`, issues)
  validateAttachmentStorage(value.storage, `${path}.storage`, issues)
  if (value.metadata !== undefined && !isObject(value.metadata)) {
    issues.push({
      path: `${path}.metadata`,
      message: `expected object or undefined, got ${describe(value.metadata)}`,
    })
  }
  // Reject any raw-content key anywhere in the attachment (incl. storage/metadata).
  const forbiddenPath = findForbiddenContentPath(value, path)
  if (forbiddenPath) {
    issues.push({
      path: forbiddenPath,
      message: "raw image content must not be carried in the payload",
    })
  }
}

function validateAttachments(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value === undefined) return
  if (!Array.isArray(value)) {
    issues.push({ path, message: `expected array or undefined, got ${describe(value)}` })
    return
  }
  value.forEach((item, index) => {
    validateAttachmentItem(item, `${path}[${index}]`, issues)
  })
}

function validateAnnotationItem(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isObject(value)) {
    issues.push({ path, message: `expected object, got ${describe(value)}` })
    return
  }
  reqString(value.id, `${path}.id`, issues)
  reqString(value.message, `${path}.message`, issues)
  reqString(value.createdAt, `${path}.createdAt`, issues)
  validateTarget(value.target, `${path}.target`, issues)
  validateAttachments(value.attachments, `${path}.attachments`, issues)
}

function validateAnnotations(value: unknown, issues: ValidationIssue[]): void {
  if (value === undefined) {
    issues.push({ path: "annotations", message: "missing required field" })
    return
  }
  if (!Array.isArray(value)) {
    issues.push({ path: "annotations", message: `expected array, got ${describe(value)}` })
    return
  }
  value.forEach((item, index) => {
    validateAnnotationItem(item, `annotations[${index}]`, issues)
  })
}

/**
 * Validate an unknown value against the `AnnotationPayload v1` contract. Returns a
 * discriminated result: `{ ok: true, payload }` on success, or `{ ok: false, issues }`
 * with a readable list of problems. Does not throw.
 */
export function validateAnnotationPayload(input: unknown): ValidatePayloadResult {
  const issues: ValidationIssue[] = []

  if (!isObject(input)) {
    issues.push({ path: "", message: `expected object, got ${describe(input)}` })
    return { ok: false, issues }
  }

  if (input.version !== "v1") {
    issues.push({ path: "version", message: `expected "v1", got ${describe(input.version)}` })
  }
  validateProject(input.project, issues)
  validatePage(input.page, issues)
  validateGroup(input.annotationGroup, issues)
  validateAnnotations(input.annotations, issues)

  if (issues.length > 0) return { ok: false, issues }
  return { ok: true, payload: input as unknown as AnnotationPayload }
}

/** Error thrown by `assertAnnotationPayload`, carrying the structured issue list. */
export class AnnotationPayloadError extends Error {
  readonly issues: ValidationIssue[]

  constructor(issues: ValidationIssue[]) {
    const detail = issues.map((issue) => `${issue.path || "<root>"}: ${issue.message}`).join("; ")
    super(`Invalid AnnotationPayload: ${detail}`)
    this.name = "AnnotationPayloadError"
    this.issues = issues
  }
}

/** Like `validateAnnotationPayload`, but throws `AnnotationPayloadError` when invalid. */
export function assertAnnotationPayload(input: unknown): AnnotationPayload {
  const result = validateAnnotationPayload(input)
  if (!result.ok) throw new AnnotationPayloadError(result.issues)
  return result.payload
}

/**
 * Validate a source manifest: an object mapping each `sourceId` to a
 * `{ sourceId, file, line, column, framework, component?, tag? }` entry whose
 * `sourceId` matches its key.
 */
export function validateSourceManifest(input: unknown): ValidateManifestResult {
  const issues: ValidationIssue[] = []

  if (!isObject(input)) {
    issues.push({ path: "", message: `expected object, got ${describe(input)}` })
    return { ok: false, issues }
  }

  for (const [key, entry] of Object.entries(input)) {
    const path = `["${key}"]`
    if (!isObject(entry)) {
      issues.push({ path, message: `expected object, got ${describe(entry)}` })
      continue
    }
    reqString(entry.sourceId, `${path}.sourceId`, issues)
    if (typeof entry.sourceId === "string" && entry.sourceId !== key) {
      issues.push({
        path: `${path}.sourceId`,
        message: `sourceId "${entry.sourceId}" does not match manifest key "${key}"`,
      })
    }
    reqString(entry.file, `${path}.file`, issues)
    reqPositiveInteger(entry.line, `${path}.line`, issues)
    reqPositiveInteger(entry.column, `${path}.column`, issues)
    reqString(entry.framework, `${path}.framework`, issues)
    optString(entry.component, `${path}.component`, issues)
    optString(entry.tag, `${path}.tag`, issues)
  }

  if (issues.length > 0) return { ok: false, issues }
  return { ok: true, manifest: input as unknown as SourceManifest }
}

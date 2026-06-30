import { randomUUID } from "node:crypto"
import { isImageAttachmentMimeType } from "@web-annotation/core"
import type { AnnotationImageAttachment, UploadImageContext } from "@web-annotation/core"

/** Decoded image handed to an `ImageStorageProvider` to persist. */
export interface StoreImageInput {
  name: string
  /** Size of the decoded image in bytes. */
  size: number
  mimeType: string
  data: Uint8Array
  width?: number
  height?: number
  context?: UploadImageContext
}

/** Bytes retained by a provider that can serve images back (e.g. the test provider). */
export interface StoredImage {
  mimeType: string
  data: Uint8Array
}

/**
 * Pluggable image storage. A host can implement this against a real object store
 * (e.g. OSS) without exposing any secret to the browser SDK; the provider runs on
 * the platform server. The returned attachment must reference the stored object
 * only — never raw image bytes.
 */
export interface ImageStorageProvider {
  store: (input: StoreImageInput) => AnnotationImageAttachment | Promise<AnnotationImageAttachment>
  /** Optional retrieval for providers that keep bytes (the in-memory test provider does). */
  retrieve?: (objectKey: string) => StoredImage | undefined | Promise<StoredImage | undefined>
}

export interface MemoryImageStorageOptions {
  /** Public base path used to build the attachment URL. Default: "/api/uploads/images". */
  publicBasePath?: string
}

export interface MemoryImageStorage extends ImageStorageProvider {
  store: (input: StoreImageInput) => AnnotationImageAttachment
  retrieve: (objectKey: string) => StoredImage | undefined
  readonly size: number
}

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
}

/**
 * In-memory image storage for local development and tests. It keeps the bytes in a
 * Map and returns a `server` storage reference. It is not a production backend.
 */
export function createMemoryImageStorage(
  options: MemoryImageStorageOptions = {},
): MemoryImageStorage {
  const base = options.publicBasePath ?? "/api/uploads/images"
  const objects = new Map<string, StoredImage>()
  return {
    store(input) {
      const ext = EXTENSION_BY_MIME[input.mimeType] ?? "bin"
      const objectKey = `${randomUUID()}.${ext}`
      objects.set(objectKey, { mimeType: input.mimeType, data: input.data })
      const attachment: AnnotationImageAttachment = {
        id: `att_${randomUUID()}`,
        kind: "image",
        name: input.name,
        mimeType: input.mimeType,
        size: input.size,
        storage: {
          provider: "server",
          objectKey,
          url: `${base}/${objectKey}`,
        },
      }
      if (input.width !== undefined) attachment.width = input.width
      if (input.height !== undefined) attachment.height = input.height
      return attachment
    },
    retrieve(objectKey) {
      return objects.get(objectKey)
    },
    get size() {
      return objects.size
    },
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/

/** Sniff the real image type from magic bytes. Returns undefined for non-images. */
function sniffImageMime(bytes: Uint8Array): string | undefined {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png"
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg"
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return "image/gif"
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp"
  }
  return undefined
}

export type ImageUploadValidation =
  | { ok: true; input: StoreImageInput }
  | { ok: false; status: number; error: string }

/**
 * Validate and decode a JSON/base64 image upload request. Enforces the image MIME
 * allow-list, valid base64, a real image (via magic bytes), a declared/actual type
 * match, and the size cap. Returns the decoded image or a `{ status, error }`.
 */
export function validateImageUpload(body: unknown, maxImageBytes: number): ImageUploadValidation {
  if (!isObject(body)) {
    return { ok: false, status: 400, error: "request body must be an object" }
  }
  if (typeof body.name !== "string" || body.name.trim() === "") {
    return { ok: false, status: 400, error: "name must be a non-empty string" }
  }
  if (typeof body.mimeType !== "string" || !isImageAttachmentMimeType(body.mimeType)) {
    return { ok: false, status: 400, error: "unsupported image type" }
  }
  if (typeof body.data !== "string" || body.data === "") {
    return { ok: false, status: 400, error: "data must be a non-empty base64 string" }
  }
  const normalized = body.data.replace(/\s+/g, "")
  if (normalized === "" || !BASE64_RE.test(normalized)) {
    return { ok: false, status: 400, error: "data is not valid base64" }
  }
  const bytes = new Uint8Array(Buffer.from(normalized, "base64"))
  if (bytes.length === 0) {
    return { ok: false, status: 400, error: "data is not valid base64" }
  }
  if (bytes.length > maxImageBytes) {
    return { ok: false, status: 413, error: "image exceeds the maximum allowed size" }
  }
  const sniffed = sniffImageMime(bytes)
  if (!sniffed) {
    return { ok: false, status: 400, error: "data is not a valid image" }
  }
  if (sniffed !== body.mimeType) {
    return { ok: false, status: 400, error: "image bytes do not match the declared type" }
  }

  const input: StoreImageInput = {
    name: body.name.trim(),
    mimeType: body.mimeType,
    size: bytes.length,
    data: bytes,
  }
  if (typeof body.width === "number" && Number.isInteger(body.width) && body.width > 0) {
    input.width = body.width
  }
  if (typeof body.height === "number" && Number.isInteger(body.height) && body.height > 0) {
    input.height = body.height
  }
  if (isObject(body.context)) {
    input.context = body.context as unknown as UploadImageContext
  }
  return { ok: true, input }
}

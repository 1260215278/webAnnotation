/**
 * Image attachment helpers for the runtime SDK.
 *
 * The annotation payload never carries raw image bytes. Images are uploaded
 * out-of-band (to the host's server or object storage) and the payload only
 * references the stored object. These helpers describe the accepted image MIME
 * types shared by the runtime, the Node kit validator, and the platform upload
 * endpoint.
 */

import type {
  AnnotationImageAttachment,
  ImageAttachmentsOptions,
  UploadImageContext,
} from "./types"

/** Image MIME types accepted for annotation image attachments. */
export const IMAGE_ATTACHMENT_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const

export type ImageAttachmentMimeType = (typeof IMAGE_ATTACHMENT_MIME_TYPES)[number]

/** Whether a string is one of the accepted image attachment MIME types. */
export function isImageAttachmentMimeType(value: string): value is ImageAttachmentMimeType {
  return (IMAGE_ATTACHMENT_MIME_TYPES as readonly string[]).includes(value)
}

/** Default cap on the number of images attached to one annotation. */
export const DEFAULT_MAX_IMAGES = 4
/** Default per-image size cap (5 MiB). */
export const DEFAULT_MAX_IMAGE_BYTES = 5 * 1024 * 1024

/**
 * JSON request body sent to `uploadEndpoint`. The base64 `data` is only sent to
 * the upload endpoint; it never appears in the annotation payload.
 */
export interface ImageUploadRequest {
  name: string
  mimeType: string
  size: number
  /** Base64-encoded image bytes (no `data:` prefix). */
  data: string
  /** Pixel dimensions, only sent when the caller already knows them. The built-in
   * runtime path does not decode the image, so it leaves these unset. */
  width?: number
  height?: number
  context?: UploadImageContext
}

/** JSON response returned by `uploadEndpoint`: the stored attachment reference. */
export interface ImageUploadResponse {
  attachment: AnnotationImageAttachment
}

/** Dependencies injected for testing the upload helpers. */
export interface UploadImageDeps {
  fetch?: typeof fetch
  /** Convert a blob to base64 (no `data:` prefix). Defaults to a FileReader impl. */
  toBase64?: (blob: Blob) => Promise<string>
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Default FileReader-based base64 encoder. */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error("[web-annotation] image read failed"))
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== "string") {
        reject(new Error("[web-annotation] unexpected image reader result"))
        return
      }
      const comma = result.indexOf(",")
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.readAsDataURL(blob)
  })
}

async function uploadViaEndpoint(
  endpoint: string,
  file: File,
  options: ImageAttachmentsOptions,
  context: UploadImageContext,
  deps: UploadImageDeps,
): Promise<AnnotationImageAttachment> {
  const fetchImpl = deps.fetch ?? globalThis.fetch
  if (!fetchImpl) {
    throw new Error("[web-annotation] no fetch implementation available for image upload")
  }
  const toBase64 = deps.toBase64 ?? blobToBase64

  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (options.getUploadAuthToken) {
    const token = await options.getUploadAuthToken()
    if (token) headers["Authorization"] = `Bearer ${token}`
  }

  const body: ImageUploadRequest = {
    name: file.name,
    mimeType: file.type,
    size: file.size,
    data: await toBase64(file),
    context,
  }

  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(`[web-annotation] image upload failed with status ${response.status}`)
  }

  const json: unknown = await response.json()
  if (!isObject(json) || !isObject(json.attachment)) {
    throw new Error("[web-annotation] image upload response is missing `attachment`")
  }
  return json.attachment as unknown as AnnotationImageAttachment
}

/**
 * Upload one image and return its stored attachment reference. `uploadImage`
 * takes precedence over `uploadEndpoint`. The returned attachment must reference
 * the stored object only — never raw image bytes.
 */
export async function uploadAnnotationImage(
  file: File,
  options: ImageAttachmentsOptions,
  context: UploadImageContext,
  deps: UploadImageDeps = {},
): Promise<AnnotationImageAttachment> {
  if (options.uploadImage) {
    return await options.uploadImage(file, context)
  }
  if (options.uploadEndpoint) {
    return await uploadViaEndpoint(options.uploadEndpoint, file, options, context, deps)
  }
  throw new Error("[web-annotation] no image upload strategy: set `uploadImage` or `uploadEndpoint`")
}

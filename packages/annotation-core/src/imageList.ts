import { ANNOTATION_UI_ATTR } from "./selector"
import { createId } from "./id"
import type { RuntimeLabels } from "./i18n"

export type ImageItemStatus = "idle" | "uploading" | "failed"

export interface ImageListItem {
  id: string
  file: File
}

export interface ImageListConfig {
  acceptedImageTypes: string[]
  maxImages: number
  maxImageBytes: number
}

export interface ImageList {
  /** The root element to mount into the overlay. */
  element: HTMLElement
  /** Currently selected (not removed) images, in insertion order. */
  getItems: () => ImageListItem[]
  /** Update the per-item status indicator. */
  setStatus: (id: string, status: ImageItemStatus, message?: string) => void
  /** Disable the picker and remove buttons (e.g. while submitting). */
  setDisabled: (disabled: boolean) => void
  /** Remove all images and revoke their object URLs. */
  reset: () => void
  /** Remove listeners, detach, and revoke any remaining object URLs. */
  destroy: () => void
}

interface InternalItem extends ImageListItem {
  element: HTMLElement
  statusEl: HTMLElement
  removeButton: HTMLButtonElement
  objectUrl: string
}

/**
 * A small image picker + thumbnail strip used inside the annotation popup. It
 * owns the lifecycle of temporary object URLs so the overlay can revoke them on
 * cancel or submit.
 */
export function createImageList(
  doc: Document,
  labels: RuntimeLabels,
  config: ImageListConfig,
  onError: (message: string) => void,
): ImageList {
  const win = doc.defaultView
  const urlApi = win?.URL ?? (typeof URL !== "undefined" ? URL : undefined)

  const items: InternalItem[] = []

  const container = doc.createElement("div")
  container.setAttribute(ANNOTATION_UI_ATTR, "overlay-images")
  Object.assign(container.style, { marginTop: "8px" })

  const addButton = doc.createElement("button")
  addButton.type = "button"
  addButton.setAttribute(ANNOTATION_UI_ATTR, "overlay-image-add")
  addButton.textContent = labels.addImage
  Object.assign(addButton.style, {
    padding: "4px 10px",
    fontSize: "12px",
    background: "#f3f4f6",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    color: "#111827",
    cursor: "pointer",
  })

  const input = doc.createElement("input")
  input.type = "file"
  input.accept = config.acceptedImageTypes.join(",")
  input.multiple = true
  input.setAttribute(ANNOTATION_UI_ATTR, "overlay-image-input")
  Object.assign(input.style, { display: "none" })

  const strip = doc.createElement("div")
  strip.setAttribute(ANNOTATION_UI_ATTR, "overlay-image-strip")
  Object.assign(strip.style, {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    marginTop: "6px",
  })

  container.appendChild(addButton)
  container.appendChild(input)
  container.appendChild(strip)

  function revoke(objectUrl: string): void {
    if (objectUrl && urlApi?.revokeObjectURL) {
      try {
        urlApi.revokeObjectURL(objectUrl)
      } catch {
        /* ignore */
      }
    }
  }

  function removeItem(id: string): void {
    const index = items.findIndex((item) => item.id === id)
    if (index === -1) return
    const [item] = items.splice(index, 1)
    revoke(item.objectUrl)
    item.element.remove()
  }

  function addItem(file: File): void {
    const id = createId("att")
    let objectUrl = ""
    if (urlApi?.createObjectURL) {
      try {
        objectUrl = urlApi.createObjectURL(file)
      } catch {
        objectUrl = ""
      }
    }

    const itemEl = doc.createElement("div")
    itemEl.setAttribute(ANNOTATION_UI_ATTR, "overlay-image-item")
    Object.assign(itemEl.style, {
      width: "72px",
      fontSize: "10px",
      color: "#374151",
    })

    const thumb = doc.createElement("img")
    if (objectUrl) thumb.src = objectUrl
    thumb.alt = file.name
    Object.assign(thumb.style, {
      width: "72px",
      height: "54px",
      objectFit: "cover",
      borderRadius: "4px",
      border: "1px solid #d1d5db",
      display: "block",
    })

    const statusEl = doc.createElement("div")
    statusEl.setAttribute(ANNOTATION_UI_ATTR, "overlay-image-status")
    Object.assign(statusEl.style, { marginTop: "2px", minHeight: "12px" })

    const removeButton = doc.createElement("button")
    removeButton.type = "button"
    removeButton.setAttribute(ANNOTATION_UI_ATTR, "overlay-image-remove")
    removeButton.textContent = labels.removeImage
    Object.assign(removeButton.style, {
      marginTop: "2px",
      padding: "1px 6px",
      fontSize: "10px",
      background: "#ffffff",
      border: "1px solid #d1d5db",
      borderRadius: "4px",
      color: "#dc2626",
      cursor: "pointer",
    })
    removeButton.addEventListener("click", () => removeItem(id))

    itemEl.appendChild(thumb)
    itemEl.appendChild(statusEl)
    itemEl.appendChild(removeButton)
    strip.appendChild(itemEl)

    items.push({ id, file, element: itemEl, statusEl, removeButton, objectUrl })
  }

  function handleChange(): void {
    const files = input.files ? Array.from(input.files) : []
    for (const file of files) {
      if (items.length >= config.maxImages) {
        onError(labels.imageLimitReached)
        break
      }
      if (!config.acceptedImageTypes.includes(file.type)) {
        onError(labels.imageTypeRejected)
        continue
      }
      if (file.size > config.maxImageBytes) {
        onError(labels.imageTooLarge)
        continue
      }
      addItem(file)
    }
    // Allow re-selecting the same file later.
    input.value = ""
  }

  function handleAddClick(): void {
    input.click()
  }

  addButton.addEventListener("click", handleAddClick)
  input.addEventListener("change", handleChange)

  return {
    element: container,
    getItems() {
      return items.map((item) => ({ id: item.id, file: item.file }))
    },
    setStatus(id, status, message) {
      const item = items.find((entry) => entry.id === id)
      if (!item) return
      if (status === "uploading") {
        item.statusEl.textContent = labels.imageUploading
        item.statusEl.style.color = "#6b7280"
      } else if (status === "failed") {
        item.statusEl.textContent = message ? `${labels.imageFailed}: ${message}` : labels.imageFailed
        item.statusEl.style.color = "#dc2626"
      } else {
        item.statusEl.textContent = ""
      }
    },
    setDisabled(disabled) {
      addButton.disabled = disabled
      input.disabled = disabled
      for (const item of items) {
        item.removeButton.disabled = disabled
      }
    },
    reset() {
      for (const item of items.splice(0)) {
        revoke(item.objectUrl)
        item.element.remove()
      }
    },
    destroy() {
      addButton.removeEventListener("click", handleAddClick)
      input.removeEventListener("change", handleChange)
      for (const item of items.splice(0)) {
        revoke(item.objectUrl)
      }
      container.remove()
    },
  }
}

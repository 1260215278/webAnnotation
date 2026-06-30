/**
 * Tiny locale mechanism for the runtime SDK's user-facing strings.
 *
 * The runtime had no i18n before image attachments were added; this module keeps
 * all visible labels in one place with Chinese and English dictionaries. English
 * values intentionally match the SDK's previous hardcoded strings, so existing
 * behavior is unchanged when no locale is configured in an English environment.
 */

export type AnnotationLocale = "zh" | "en"

export interface RuntimeLabels {
  /** Floating widget button, inactive state. */
  widgetEnable: string
  /** Floating widget button, active state. */
  widgetActive: string
  /** Overlay textarea placeholder. */
  placeholder: string
  /** Overlay hint line, idle state. */
  hint: string
  /** Overlay hint line, while submitting. */
  submitting: string
  /** Error shown when submitting an empty annotation. */
  emptyError: string
  /** Suffix appended to a submission failure reason. */
  submitRetrySuffix: string
  /** "Add image" picker button. */
  addImage: string
  /** Per-image status while uploading. */
  imageUploading: string
  /** Per-image status when an upload failed. */
  imageFailed: string
  /** Remove-image button label. */
  removeImage: string
  /** Error when images are attached but no uploader is configured. */
  uploadNotConfigured: string
  /** Error when an image upload fails during submission. */
  uploadFailed: string
  /** Error when a selected image exceeds the size limit. */
  imageTooLarge: string
  /** Error when a selected file is not an accepted image type. */
  imageTypeRejected: string
  /** Error when the image count limit is reached. */
  imageLimitReached: string
}

const LABELS: Record<AnnotationLocale, RuntimeLabels> = {
  en: {
    widgetEnable: "Annotate",
    widgetActive: "Annotating…",
    placeholder: "Describe the change… (Enter to submit, Esc to cancel)",
    hint: "Enter submit · Shift+Enter newline · Esc cancel",
    submitting: "Submitting…",
    emptyError: "Please enter an annotation before submitting.",
    submitRetrySuffix: " — press Enter to retry.",
    addImage: "Add image",
    imageUploading: "Uploading…",
    imageFailed: "Upload failed",
    removeImage: "Remove",
    uploadNotConfigured: "Image upload is not configured.",
    uploadFailed: "Image upload failed — remove the image or try again.",
    imageTooLarge: "Image is too large.",
    imageTypeRejected: "Unsupported image type.",
    imageLimitReached: "Maximum number of images reached.",
  },
  zh: {
    widgetEnable: "批注",
    widgetActive: "批注中…",
    placeholder: "描述需要的修改…（Enter 提交，Esc 取消）",
    hint: "Enter 提交 · Shift+Enter 换行 · Esc 取消",
    submitting: "提交中…",
    emptyError: "请先输入批注内容再提交。",
    submitRetrySuffix: " — 按 Enter 重试。",
    addImage: "添加图片",
    imageUploading: "上传中…",
    imageFailed: "上传失败",
    removeImage: "删除",
    uploadNotConfigured: "未配置图片上传。",
    uploadFailed: "图片上传失败 — 请删除该图片或重试。",
    imageTooLarge: "图片过大。",
    imageTypeRejected: "不支持的图片类型。",
    imageLimitReached: "已达到图片数量上限。",
  },
}

/**
 * Resolve the active locale: an explicit override wins; otherwise detect Chinese
 * from `navigator.language` and fall back to English.
 */
export function resolveAnnotationLocale(win: Window, override?: AnnotationLocale): AnnotationLocale {
  if (override === "zh" || override === "en") return override
  const lang = win.navigator?.language ?? ""
  return lang.toLowerCase().startsWith("zh") ? "zh" : "en"
}

/** Return the label dictionary for a locale. */
export function getRuntimeLabels(locale: AnnotationLocale): RuntimeLabels {
  return LABELS[locale]
}

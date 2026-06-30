import type {
  AnnotationAttachment,
  AnnotationItem,
  AnnotationPayload,
  AnnotationTarget,
  PageInfo,
  ProjectInfo,
} from "./types"
import { createId } from "./id"

/** Read page-level context from a window/document pair. */
export function buildPageInfo(win: Window): PageInfo {
  return {
    url: win.location.href,
    route: win.location.pathname,
    title: win.document.title,
    viewport: {
      width: win.innerWidth,
      height: win.innerHeight,
    },
  }
}

export interface BuildAnnotationItemInput {
  message: string
  target: AnnotationTarget
  attachments?: AnnotationAttachment[]
  id?: string
  createdAt?: string
}

export function buildAnnotationItem(input: BuildAnnotationItemInput): AnnotationItem {
  const item: AnnotationItem = {
    id: input.id ?? createId("anno"),
    message: input.message,
    target: input.target,
    createdAt: input.createdAt ?? new Date().toISOString(),
  }
  if (input.attachments && input.attachments.length > 0) {
    item.attachments = input.attachments
  }
  return item
}

export interface BuildPayloadInput {
  project: ProjectInfo
  page: PageInfo
  annotations: AnnotationItem[]
  groupId?: string
}

/**
 * Construct an AnnotationPayload v1. Pure and deterministic given an explicit
 * `groupId`; this is the unit-tested core of the SDK.
 */
export function buildAnnotationPayload(input: BuildPayloadInput): AnnotationPayload {
  return {
    version: "v1",
    project: input.project,
    page: input.page,
    annotationGroup: {
      id: input.groupId ?? createId("group"),
      mode: "single",
    },
    annotations: input.annotations,
  }
}

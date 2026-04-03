/**
 * upload.ts — Multer configuration
 * Task: T-039 — Extended to accept video MIME types
 * Sprint 2
 */

import multer, { type FileFilterCallback } from 'multer'
import { type Request } from 'express'
import path from 'path'

export const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]

export const ACCEPTED_VIDEO_TYPES = [
  'video/mp4',
  'video/quicktime',  // .mov
  'video/webm',
]

export const ALL_ACCEPTED_TYPES = [
  ...ACCEPTED_IMAGE_TYPES,
  ...ACCEPTED_VIDEO_TYPES,
]

const MAX_IMAGE_SIZE = 10  * 1024 * 1024   // 10 MB
const MAX_VIDEO_SIZE = 50  * 1024 * 1024   // 50 MB

const EXTENSION_MAP: Record<string, string> = {
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.webp': 'image/webp',
  '.gif':  'image/gif',
  '.mp4':  'video/mp4',
  '.mov':  'video/quicktime',
  '.webm': 'video/webm',
}

function fileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
): void {
  let mimeType = file.mimetype

  // Fallback: if MIME is generic, infer from file extension
  if (mimeType === 'application/octet-stream' || mimeType === 'application/unknown') {
    const ext = path.extname(file.originalname).toLowerCase()
    mimeType = EXTENSION_MAP[ext] ?? mimeType
    file.mimetype = mimeType  // Correct it in-place so the controller sees the right type
  }

  if (ALL_ACCEPTED_TYPES.includes(mimeType)) {
    cb(null, true)
  } else {
    cb(new Error(
      `INVALID_TYPE: Accepted formats are JPEG, PNG, WEBP, GIF (images) ` +
      `and MP4, MOV, WEBM (videos). Got: ${file.mimetype}`
    ))
  }
}

// function fileFilter(
//   _req: Request,
//   file: Express.Multer.File,
//   cb: FileFilterCallback
// ): void {
//   if (ALL_ACCEPTED_TYPES.includes(file.mimetype)) {
//     cb(null, true)
//   } else {
//     cb(new Error(
//       `INVALID_TYPE: Accepted formats are JPEG, PNG, WEBP, GIF (images) ` +
//       `and MP4, MOV, WEBM (videos). Got: ${file.mimetype}`
//     ))
//   }
// }

export const upload = multer({
  storage:    multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: MAX_VIDEO_SIZE,  // Use video limit — image limit enforced in controller
    files:    1,
  },
})

// Helper used in controller to enforce per-type size limits
export function getMaxSize(mimeType: string): number {
  return ACCEPTED_VIDEO_TYPES.includes(mimeType) ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE
}

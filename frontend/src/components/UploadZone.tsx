/**
 * UploadZone.tsx
 * Task: T-038 — Video Upload Component (extended from T-012)
 * Sprint 2
 *
 * Now accepts both images and videos.
 * Videos show a duration check (max 60s) and a video-specific preview.
 */

import { useState, useRef, useCallback, type DragEvent, type ChangeEvent } from 'react'
import Button from '@/components/ui/Button'

// ── Constants ─────────────────────────────────────────────────────────────────
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm']
const ACCEPTED_ALL         = [...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_VIDEO_TYPES]

const ACCEPTED_DISPLAY = 'JPG, PNG, WEBP, GIF · MP4, MOV, WEBM'
const MAX_IMAGE_BYTES  = 10 * 1024 * 1024   // 10 MB
const MAX_VIDEO_BYTES  = 50 * 1024 * 1024   // 50 MB
const MAX_VIDEO_SECS   = 60
const MIN_DIMENSION    = 100

export type MediaType = 'image' | 'video'

export interface ValidatedFile {
  file:       File
  previewUrl: string
  mediaType:  MediaType
  width?:     number
  height?:    number
  duration?:  number   // seconds, for video
}

interface UploadZoneProps {
  onFileReady:   (validated: ValidatedFile) => void
  onClear:       () => void
  disabled?:     boolean
  currentFile?:  ValidatedFile | null
}

type ValidationError =
  | 'INVALID_TYPE'
  | 'IMAGE_TOO_LARGE'
  | 'VIDEO_TOO_LARGE'
  | 'VIDEO_TOO_LONG'
  | 'IMAGE_TOO_SMALL'
  | 'LOAD_ERROR'

const ERROR_MESSAGES: Record<ValidationError, string> = {
  INVALID_TYPE:    `Unsupported format. Accepted: ${ACCEPTED_DISPLAY}.`,
  IMAGE_TOO_LARGE: 'Image too large. Maximum size is 10 MB.',
  VIDEO_TOO_LARGE: 'Video too large. Maximum size is 50 MB.',
  VIDEO_TOO_LONG:  `Video too long. Maximum duration is ${MAX_VIDEO_SECS} seconds.`,
  IMAGE_TOO_SMALL: `Image too small. Minimum resolution is ${MIN_DIMENSION}×${MIN_DIMENSION}px.`,
  LOAD_ERROR:      'Could not read the file. Please try a different one.',
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function UploadZone({
  onFileReady, onClear, disabled = false, currentFile = null,
}: UploadZoneProps) {
  const [dragging, setDragging]     = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [validating, setValidating] = useState(false)
  const inputRef                    = useRef<HTMLInputElement>(null)

  const validate = useCallback((file: File): Promise<ValidatedFile> => {
    return new Promise((resolve, reject) => {
      if (!ACCEPTED_ALL.includes(file.type)) { reject('INVALID_TYPE'); return }

      const isVideo = ACCEPTED_VIDEO_TYPES.includes(file.type)

      if (isVideo) {
        // ── Video validation ─────────────────────────────────────────────────
        if (file.size > MAX_VIDEO_BYTES) { reject('VIDEO_TOO_LARGE'); return }

        const url   = URL.createObjectURL(file)
        const video = document.createElement('video')
        video.preload = 'metadata'

        video.onloadedmetadata = () => {
          if (video.duration > MAX_VIDEO_SECS) {
            URL.revokeObjectURL(url); reject('VIDEO_TOO_LONG'); return
          }
          resolve({
            file, previewUrl: url, mediaType: 'video',
            duration: Math.round(video.duration),
          })
        }
        video.onerror = () => { URL.revokeObjectURL(url); reject('LOAD_ERROR') }
        video.src = url

      } else {
        // ── Image validation ─────────────────────────────────────────────────
        if (file.size > MAX_IMAGE_BYTES) { reject('IMAGE_TOO_LARGE'); return }

        const url = URL.createObjectURL(file)
        const img = new Image()
        img.onload = () => {
          if (img.width < MIN_DIMENSION || img.height < MIN_DIMENSION) {
            URL.revokeObjectURL(url); reject('IMAGE_TOO_SMALL'); return
          }
          resolve({
            file, previewUrl: url, mediaType: 'image',
            width: img.width, height: img.height,
          })
        }
        img.onerror = () => { URL.revokeObjectURL(url); reject('LOAD_ERROR') }
        img.src = url
      }
    })
  }, [])

  const handleFile = useCallback(async (file: File) => {
    setError(null); setValidating(true)
    try {
      const validated = await validate(file)
      onFileReady(validated)
    } catch (err) {
      setError(ERROR_MESSAGES[err as ValidationError] ?? 'Unexpected error.')
    } finally {
      setValidating(false)
    }
  }, [validate, onFileReady])

  function handleDragOver(e: DragEvent)  { e.preventDefault(); if (!disabled) setDragging(true) }
  function handleDragLeave(e: DragEvent) { e.preventDefault(); setDragging(false) }
  function handleDrop(e: DragEvent) {
    e.preventDefault(); setDragging(false)
    if (disabled) return
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }
  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }
  function handleClear() {
    if (currentFile?.previewUrl) URL.revokeObjectURL(currentFile.previewUrl)
    setError(null); onClear()
  }

  // ── Preview — file selected ───────────────────────────────────────────────
  if (currentFile) {
    return (
      <div className="rounded-xl border border-garby-green/40 bg-garby-green/5 p-4">
        <div className="flex items-start gap-4">

          {/* Thumbnail / video preview */}
          <div className="relative shrink-0 w-20 h-20 rounded-lg overflow-hidden border border-white/10 bg-white/5">
            {currentFile.mediaType === 'video' ? (
              <>
                <video
                  src={currentFile.previewUrl}
                  className="w-full h-full object-cover"
                  muted playsInline
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                </div>
              </>
            ) : (
              <img src={currentFile.previewUrl} alt="Preview" className="w-full h-full object-cover"/>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-white text-sm truncate">{currentFile.file.name}</p>
            <p className="text-garby-grey text-xs mt-1">
              {(currentFile.file.size / 1024 / 1024).toFixed(2)} MB
              {currentFile.mediaType === 'video' && currentFile.duration
                ? ` · ${currentFile.duration}s video`
                : currentFile.width
                  ? ` · ${currentFile.width}×${currentFile.height}px`
                  : ''
              }
            </p>
            <div className="flex items-center gap-1.5 mt-2">
              <div className="w-1.5 h-1.5 rounded-full bg-garby-green animate-pulse"/>
              <span className="text-garby-green text-xs font-medium">
                Ready to scan · {currentFile.mediaType === 'video' ? 'Video' : 'Image'}
              </span>
            </div>
          </div>

          {/* Clear */}
          <button onClick={handleClear} disabled={disabled}
            className="shrink-0 text-garby-grey hover:text-white transition-colors" aria-label="Remove">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>
    )
  }

  // ── Drop zone ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      <div
        role="button" tabIndex={disabled ? -1 : 0}
        aria-label="Upload image or video"
        onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={e => e.key === 'Enter' && !disabled && inputRef.current?.click()}
        className={`
          relative rounded-xl border-2 border-dashed px-8 py-12
          flex flex-col items-center justify-center text-center
          transition-all duration-200 cursor-pointer select-none
          ${disabled ? 'border-white/10 opacity-50 cursor-not-allowed'
            : dragging ? 'border-garby-green bg-garby-green/10 scale-[1.01]'
            : 'border-white/15 hover:border-garby-green/50 hover:bg-white/[0.02]'}
        `}
      >
        <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 transition-all
          ${dragging ? 'bg-garby-green/20 scale-110' : 'bg-white/5'}`}>
          {validating
            ? <svg className="w-6 h-6 text-garby-green animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            : <svg className={`w-6 h-6 ${dragging ? 'text-garby-green' : 'text-garby-grey'}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
              </svg>
          }
        </div>

        <p className="text-white font-medium mb-1">
          {dragging ? 'Drop it here' : 'Drop your image or video here'}
        </p>
        <p className="text-garby-grey text-sm mb-4">
          or <span className="text-garby-green underline underline-offset-2">browse files</span>
        </p>

        {/* Two-column format hints */}
        <div className="flex items-start gap-6 text-xs text-garby-grey">
          <div>
            <p className="font-semibold text-white/60 mb-1">Images</p>
            <p>JPG · PNG · WEBP · GIF</p>
            <p>Max 10 MB · Min 100×100px</p>
          </div>
          <div className="w-px bg-white/10 self-stretch"/>
          <div>
            <p className="font-semibold text-white/60 mb-1">Videos <span className="text-garby-cyan text-xs font-normal ml-1">BETA</span></p>
            <p>MP4 · MOV · WEBM</p>
            <p>Max 50 MB · Max 60s</p>
          </div>
        </div>

        <input ref={inputRef} type="file"
          accept={ACCEPTED_ALL.join(',')}
          onChange={handleInputChange} className="hidden" aria-hidden="true"/>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 animate-fade-in">
          <svg className="w-4 h-4 text-red-400 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
          </svg>
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}
    </div>
  )
}

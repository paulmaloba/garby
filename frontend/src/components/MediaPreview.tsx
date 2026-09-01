/**
 * MediaPreview.tsx
 * Task: T-033 — Scan Result Image Preview Fix
 * Sprint 2
 *
 * Renders an image or video from R2 CDN with a graceful fallback
 * if the image has expired or fails to load.
 */

interface MediaPreviewProps {
  url:       string
  mediaType?: string
  className?: string
  alt?:       string
}

export default function MediaPreview({
  url,
  mediaType = 'image',
  className = 'w-full h-full object-cover',
  alt       = 'Scanned media',
}: MediaPreviewProps) {
  const isVideo = mediaType === 'video'

  function handleError(e: React.SyntheticEvent<HTMLImageElement | HTMLVideoElement>) {
    const el = e.currentTarget
    el.style.display = 'none'
    const fallbackEl = el.nextElementSibling as HTMLElement
    if (fallbackEl) fallbackEl.style.display = 'flex'
  }

  if (isVideo) {
    return (
      <>
        <video
          src={url}
          className={className}
          controls
          playsInline
          preload="metadata"
          onError={handleError}
        >
          <source src={url} type="video/mp4"/>
        </video>
        <MediaFallback/>
      </>
    )
  }

  return (
    <>
      <img
        src={url}
        alt={alt}
        className={className}
        loading="lazy"
        // No crossOrigin here — this is a plain display, not read back via canvas,
        // and the R2 bucket doesn't send Access-Control-Allow-Origin. Setting
        // crossOrigin="anonymous" without matching CORS headers makes the browser
        // refuse to load the image at all, which is why previews were going blank.
        onError={handleError}
      />
      <MediaFallback/>
    </>
  )
}

// Shown when the image/video fails to load — hidden by default, toggled on by handleError above.
function MediaFallback() {
  return (
    <div
      className="w-full h-full items-center justify-center bg-white/5 hidden"
      aria-label="Media unavailable"
    >
      <div className="text-center p-4">
        <svg className="w-8 h-8 text-garby-grey mx-auto mb-2" fill="none"
          viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
        </svg>
        <p className="text-garby-grey text-xs">Preview expired</p>
      </div>
    </div>
  )
}

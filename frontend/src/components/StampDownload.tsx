/**
 * StampDownload.tsx
 * Task: T-028 — Garby Stamp
 * Sprint 2
 *
 * Shown on the ScanResultPage.
 * Lets users generate and download either the border or overlay stamp variant.
 */

import { useState } from 'react'
import Button from '@/components/ui/Button'

interface StampDownloadProps {
  scanId: string
}

type Variant = 'border' | 'overlay'

const VARIANTS: { id: Variant; label: string; desc: string }[] = [
  {
    id:    'border',
    label: 'Border stamp',
    desc:  'Branded footer added below your image. Image content fully preserved.',
  },
  {
    id:    'overlay',
    label: 'Overlay stamp',
    desc:  'Subtle badge in the corner of the image. Minimal and unobtrusive.',
  },
]

export default function StampDownload({ scanId }: StampDownloadProps) {
  const [selected, setSelected]   = useState<Variant>('border')
  const [loading, setLoading]     = useState(false)
  const [stampUrl, setStampUrl]   = useState<string | null>(null)
  const [error, setError]         = useState<string | null>(null)

  async function handleGenerate() {
    setLoading(true)
    setError(null)
    setStampUrl(null)

    try {
      const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
      const res    = await fetch(`${apiUrl}/api/stamp/${scanId}?variant=${selected}`)
      const json   = await res.json()

      if (!res.ok) throw new Error(json.message ?? 'Failed to generate stamp')

      setStampUrl(json.data.url)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

//   async function handleDownload() {
//     if (!stampUrl) return
//     const res  = await fetch(stampUrl)
//     const blob = await res.blob()
//     const url  = URL.createObjectURL(blob)
//     const a    = document.createElement('a')
//     a.href     = url
//     a.download = `garby-stamp-${scanId.slice(0, 8)}.png`
//     a.click()
//     URL.revokeObjectURL(url)
//   }
   function handleDownload() {
      if (!stampUrl) return
      const a    = document.createElement('a')
      a.href     = stampUrl
      a.download = `garby-stamp-${scanId.slice(0, 8)}.png`
      a.target   = '_blank'
      a.rel      = 'noopener noreferrer'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }

  return (
    <div className="card border border-white/10">

      {/* Header */}
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-8 h-8 rounded-lg bg-garby-green/10 flex items-center justify-center">
          <svg className="w-4 h-4 text-garby-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
          </svg>
        </div>
        <div>
          <h3 className="font-semibold text-white">Garby Stamp</h3>
          <p className="text-garby-grey text-xs">
            Download your image with an authenticity certificate
          </p>
        </div>
      </div>

      {/* Variant selector */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        {VARIANTS.map(v => (
          <button
            key={v.id}
            onClick={() => { setSelected(v.id); setStampUrl(null) }}
            className={`
              text-left p-3 rounded-lg border transition-all duration-200
              ${selected === v.id
                ? 'border-garby-green bg-garby-green/5'
                : 'border-white/10 hover:border-white/20'
              }
            `}
          >
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-3 h-3 rounded-full border-2 transition-colors ${
                selected === v.id
                  ? 'border-garby-green bg-garby-green'
                  : 'border-garby-grey'
              }`} />
              <span className="text-sm font-medium text-white">{v.label}</span>
            </div>
            <p className="text-xs text-garby-grey pl-5 leading-relaxed">{v.desc}</p>
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
          {error}
        </div>
      )}

      {/* Preview + download */}
      {stampUrl && (
        <div className="mb-4 rounded-lg overflow-hidden border border-garby-green/20">
          <img src={stampUrl} alt="Garby stamped image" className="w-full" />
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        {!stampUrl ? (
          <Button
            onClick={handleGenerate}
            loading={loading}
            fullWidth
            size="sm"
          >
            {loading ? 'Generating stamp...' : 'Generate stamp'}
          </Button>
        ) : (
          <>
            <Button onClick={handleDownload} fullWidth size="sm">
              Download stamped image
            </Button>
            <Button
              onClick={() => { setStampUrl(null) }}
              variant="secondary"
              size="sm"
            >
              Change
            </Button>
          </>
        )}
      </div>

      <p className="text-xs text-garby-grey mt-3 text-center">
        Stamped images link back to the full scan report via QR code · Free for all users
      </p>
    </div>
  )
}

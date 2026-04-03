/**
 * stamp.service.ts
 * Task: T-028 — Garby Stamp
 * Sprint 2
 *
 * Composites a Garby authenticity badge onto a scanned image.
 * Uses the 'sharp' library for high-performance image processing.
 *
 * Two variants:
 *   overlay — semi-transparent badge in the bottom-right corner
 *   border  — adds a branded footer strip below the image
 *
 * Output is stored permanently in R2 (no TTL) under /stamps/.
 * Returns the public CDN URL of the stamped image.
 */

import sharp from 'sharp'
import QRCode from 'qrcode'
import { uploadImageToS3 } from './storage.service'
import type { Classification } from '../types'

export type StampVariant = 'overlay' | 'border'

interface StampOptions {
  scanId:         string
  imageBuffer:    Buffer
  classification: Classification
  confidence:     number
  scannedAt:      string
  variant?:       StampVariant
}

interface StampResult {
  url:    string
  key:    string
  width:  number
  height: number
}

// ── Brand colours (matches frontend palette) ──────────────────────────────────
const COLOURS = {
  AI_GENERATED: { bg: '#FF3B5C', text: '#FFFFFF', label: 'AI GENERATED' },
  REAL:         { bg: '#2ECC71', text: '#07081A', label: 'REAL'         },
  UNCERTAIN:    { bg: '#F59E0B', text: '#07081A', label: 'UNCERTAIN'    },
}

const DARK_BG = '#07081A'
const BRAND   = '#2ECC71'

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateStamp(opts: StampOptions): Promise<StampResult> {
  const { scanId, imageBuffer, classification, confidence, scannedAt, variant = 'border' } = opts

  const colour  = COLOURS[classification] ?? COLOURS.UNCERTAIN
  const pct     = Math.round(confidence * 100)
  const dateStr = new Date(scannedAt).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })

  // Get image dimensions
  const meta = await sharp(imageBuffer).metadata()
  const imgW  = meta.width  ?? 800
  const imgH  = meta.height ?? 600

  let stampBuffer: Buffer

  if (variant === 'border') {
    stampBuffer = await borderStamp(imageBuffer, imgW, imgH, colour, pct, dateStr, scanId)
  } else {
    stampBuffer = await overlayStamp(imageBuffer, imgW, imgH, colour, pct)
  }

  // Upload permanently (no TTL tag)
  const result = await uploadImageToS3(
    stampBuffer,
    'image/png',
    `stamp-${scanId}-${variant}`
  )

  const finalMeta = await sharp(stampBuffer).metadata()

  return {
    url:    result.url,
    key:    result.key,
    width:  finalMeta.width  ?? imgW,
    height: finalMeta.height ?? imgH,
  }
}

// ── Border stamp — adds branded footer below the image ────────────────────────

async function borderStamp(
  imageBuffer: Buffer,
  imgW: number,
  imgH: number,
  colour: typeof COLOURS.REAL,
  pct: number,
  dateStr: string,
  scanId: string
): Promise<Buffer> {
  const footerH    = Math.round(imgW * 0.09)
  const fontSize   = Math.max(12, Math.round(footerH * 0.28))
  const smallFontSize = Math.max(9, Math.round(footerH * 0.20))
  const padding    = Math.round(footerH * 0.25)
  const qrSize     = Math.round(footerH * 0.80)
  const qrMargin   = Math.round((footerH - qrSize) / 2)

  // Generate QR code pointing to full scan report
  const scanUrl  = `https://garby.app/scan/${scanId}`
  const qrBuffer = await QRCode.toBuffer(scanUrl, {
    type:             'png',
    width:            qrSize,
    margin:           1,
    color: {
      dark:  '#F0F2FF',
      light: '#07081A',
    },
  })

  const footerSvg = `
    <svg width="${imgW - qrSize - qrMargin}" height="${footerH}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${imgW}" height="${footerH}" fill="${DARK_BG}"/>
      <rect width="4" height="${footerH}" fill="${colour.bg}"/>

      <text x="${padding + 8}" y="${footerH * 0.48}"
        font-family="system-ui, -apple-system, sans-serif"
        font-weight="700" font-size="${fontSize}"
        fill="#F0F2FF" dominant-baseline="middle">GARBY</text>

      <circle cx="${padding + 8 + (fontSize * 3.8)}" cy="${footerH * 0.48}"
        r="${fontSize * 0.18}" fill="#7F8C8D"/>

      <rect x="${padding + 8 + (fontSize * 4.2)}" y="${footerH * 0.22}"
        width="${fontSize * 6.5}" height="${footerH * 0.55}" rx="3" fill="${colour.bg}"/>
      <text x="${padding + 8 + (fontSize * 4.2) + (fontSize * 3.25)}" y="${footerH * 0.50}"
        font-family="system-ui, -apple-system, sans-serif"
        font-weight="700" font-size="${smallFontSize}"
        fill="${colour.text}" text-anchor="middle" dominant-baseline="middle">${colour.label}</text>

      <text x="${padding + 8 + (fontSize * 4.2) + (fontSize * 6.8)}" y="${footerH * 0.48}"
        font-family="system-ui, -apple-system, sans-serif"
        font-weight="600" font-size="${smallFontSize}"
        fill="#7F8C8D" dominant-baseline="middle">${pct}% confidence</text>

      <text x="${imgW - qrSize - qrMargin - padding}" y="${footerH * 0.35}"
        font-family="system-ui, -apple-system, sans-serif"
        font-size="${smallFontSize}" fill="#7F8C8D"
        text-anchor="end" dominant-baseline="middle">${dateStr}</text>
      <text x="${imgW - qrSize - qrMargin - padding}" y="${footerH * 0.65}"
        font-family="system-ui, -apple-system, sans-serif"
        font-size="${Math.max(8, smallFontSize - 2)}" fill="#3A3A5C"
        text-anchor="end" dominant-baseline="middle">Scan QR to verify →</text>
    </svg>
  `

  // Composite: image + footer SVG + QR code
  return sharp({
    create: {
      width:      imgW,
      height:     imgH + footerH,
      channels:   3,
      background: DARK_BG,
    },
  })
    .composite([
      { input: imageBuffer,                top: 0,           left: 0 },
      { input: Buffer.from(footerSvg),     top: imgH,        left: 0 },
      { input: qrBuffer,                   top: imgH + qrMargin, left: imgW - qrSize - qrMargin },
    ])
    .png({ quality: 95 })
    .toBuffer()
}

// ── Overlay stamp — semi-transparent badge on the image corner ────────────────

async function overlayStamp(
  imageBuffer: Buffer,
  imgW: number,
  imgH: number,
  colour: typeof COLOURS.REAL,
  pct: number
): Promise<Buffer> {
  const badgeW = Math.round(imgW * 0.32)
  const badgeH = Math.round(badgeW * 0.22)
  const fs     = Math.max(10, Math.round(badgeH * 0.35))

  const badgeSvg = `
    <svg width="${badgeW}" height="${badgeH}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${badgeW}" height="${badgeH}" rx="4"
        fill="${DARK_BG}" fill-opacity="0.85"/>
      <rect width="3" height="${badgeH}" rx="1" fill="${colour.bg}"/>
      <text
        x="10" y="${badgeH * 0.45}"
        font-family="system-ui, sans-serif"
        font-weight="700" font-size="${fs}"
        fill="#F0F2FF" dominant-baseline="middle"
      >GARBY</text>
      <text
        x="10" y="${badgeH * 0.78}"
        font-family="system-ui, sans-serif"
        font-weight="600" font-size="${Math.max(8, fs - 3)}"
        fill="${colour.bg}" dominant-baseline="middle"
      >${colour.label} · ${pct}%</text>
    </svg>
  `

  const margin = Math.round(imgW * 0.025)

  return sharp(imageBuffer)
    .composite([{
      input:   Buffer.from(badgeSvg),
      top:     imgH - badgeH - margin,
      left:    imgW - badgeW - margin,
      blend:   'over',
    }])
    .png({ quality: 95 })
    .toBuffer()
}

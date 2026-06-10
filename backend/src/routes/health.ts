import { Router } from 'express'

export const healthRouter = Router()

const ENGINE_URL = process.env.GARBY_ENGINE_URL ?? 'http://garby-engine.railway.internal:8080'

/**
 * GET /health
 * Used by load balancers, CI/CD, and uptime monitors.
 */
healthRouter.get('/', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'garby-api',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV ?? 'development',
  })
})

/**
 * GET /health/engine
 * Probes the garby-engine /health endpoint and reports connectivity.
 * Use this to verify backend → engine networking without running a full scan.
 */
healthRouter.get('/engine', async (_req, res) => {
  try {
    const response = await fetch(`${ENGINE_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    })

    console.log(`[HealthCheck] Engine responded with HTTP ${response.status}`)

    res.status(200).json({
      engine_reachable: true,
      engine_url: ENGINE_URL,
      status: response.status,
      message: 'Engine is healthy',
    })
  } catch (err) {
    const error = err as NodeJS.ErrnoException

    // Normalise the error code: fetch wraps OS errors inside a TypeError,
    // so check both the top-level code and the cause's code.
    const code: string =
      error.code ??
      (error.cause as NodeJS.ErrnoException | undefined)?.code ??
      error.name ??
      'UNKNOWN'

    const messages: Record<string, string> = {
      ECONNREFUSED:  'Connection refused - engine not listening on port 8080',
      ENOTFOUND:     'DNS resolution failed - engine hostname not reachable',
      ECONNRESET:    'Connection reset by engine',
      TimeoutError:  'Request timed out - engine did not respond within 5 s',
      AbortError:    'Request timed out - engine did not respond within 5 s',
    }

    const message = messages[code] ?? `Unexpected error: ${error.message}`

    console.error(`[HealthCheck] Engine unreachable — ${code}: ${error.message}`)

    res.status(200).json({
      engine_reachable: false,
      engine_url: ENGINE_URL,
      error: code,
      message,
    })
  }
})

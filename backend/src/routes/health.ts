import { Router } from 'express'

export const healthRouter = Router()

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

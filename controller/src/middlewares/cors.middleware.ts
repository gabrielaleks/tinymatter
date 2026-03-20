import cors from 'cors'

export const corsMiddleware = () => {
  const frontendHost = process.env.LOCAL_FRONTEND_HOST
  const frontendPort = process.env.LOCAL_FRONTEND_PORT
  const publicFrontendUrl = process.env.PUBLIC_FRONTEND_URL

  const allowedOrigins: string[] = []

  if (frontendHost && frontendPort) {
    allowedOrigins.push(`http://localhost:${frontendPort}`)
    allowedOrigins.push(`http://${frontendHost}:${frontendPort}`)
  }

  if (publicFrontendUrl) {
    allowedOrigins.push(publicFrontendUrl)
  }

  if (allowedOrigins.length === 0) {
    throw new Error('No allowed CORS origins defined')
  }

  return cors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
}

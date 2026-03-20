import { Request, Response } from "express"
import { LoggerService } from "../application/services/LoggerService"

export const notFoundMiddleware = (req: Request, res: Response) => {
  const message = `Route not found: ${req.method} ${req.originalUrl}`

  LoggerService.logError(message)

  res.status(404).json({
    status: "error",
    code: 404,
    message,
    timestamp: new Date().toISOString(),
  })
}
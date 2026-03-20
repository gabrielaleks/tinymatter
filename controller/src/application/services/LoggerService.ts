import { getLogger } from "../../utils/logger"

export class LoggerService {
  private static logger = getLogger()

  static logInfo(message: string, metadata?: Record<string, any>) {
    this.logger.info(message, metadata)
  }

  static logError(message: string, error?: Error, metadata?: Record<string, any>) {
    const errorMetadata = {
      ...metadata,
      error: error?.message,
      stack: error?.stack,
    }

    this.logger.error(
      message,
      error ? errorMetadata : null
    )
  }
}
import { Socket } from 'socket.io';
import { logger } from './logger';

/**
 * Error types for categorization
 */
export enum ErrorType {
  VALIDATION = 'VALIDATION',
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  INTERNAL = 'INTERNAL',
  NETWORK = 'NETWORK',
  TIMEOUT = 'TIMEOUT',
}

/**
 * Structured error class
 */
export class AppError extends Error {
  public readonly type: ErrorType;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly context?: any;

  constructor(
    message: string,
    type: ErrorType = ErrorType.INTERNAL,
    statusCode: number = 500,
    isOperational: boolean = true,
    context?: any
  ) {
    super(message);
    this.type = type;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.context = context;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error handler utility
 */
export class ErrorHandler {
  /**
   * Handle error and send to client
   */
  static handleError(socket: Socket, error: Error | AppError, event?: string): void {
    // Log the error
    this.logError(error, { socketId: socket.id, event });

    // Send error to client
    const errorResponse = this.formatErrorResponse(error);
    socket.emit('error', errorResponse);
  }

  /**
   * Handle error with callback
   */
  static handleErrorWithCallback(
    error: Error | AppError,
    callback?: (response: any) => void,
    context?: any
  ): void {
    // Log the error
    this.logError(error, context);

    // Send error via callback if provided
    if (callback) {
      const errorResponse = this.formatErrorResponse(error);
      callback(errorResponse);
    }
  }

  /**
   * Log error with context
   */
  static logError(error: Error | AppError, context?: any): void {
    const errorInfo = {
      message: error.message,
      stack: error.stack,
      ...context,
    };

    if (error instanceof AppError) {
      errorInfo['type'] = error.type;
      errorInfo['statusCode'] = error.statusCode;
      errorInfo['isOperational'] = error.isOperational;
      if (error.context) {
        errorInfo['errorContext'] = error.context;
      }
    }

    logger.error('Error occurred', errorInfo);
  }

  /**
   * Format error response for client
   */
  static formatErrorResponse(error: Error | AppError): any {
    if (error instanceof AppError) {
      return {
        error: error.message,
        type: error.type,
        code: error.statusCode,
      };
    }

    // For unknown errors, don't expose internal details
    return {
      error: 'An unexpected error occurred',
      type: ErrorType.INTERNAL,
      code: 500,
    };
  }

  /**
   * Wrap async handler with error handling
   */
  static wrapAsync(
    handler: (socket: Socket, data: any, callback?: any) => Promise<void>
  ): (socket: Socket, data: any, callback?: any) => Promise<void> {
    return async (socket: Socket, data: any, callback?: any) => {
      try {
        await handler(socket, data, callback);
      } catch (error) {
        if (error instanceof Error) {
          this.handleError(socket, error);
          if (callback) {
            this.handleErrorWithCallback(error, callback, { socketId: socket.id });
          }
        }
      }
    };
  }

  /**
   * Check if error is operational
   */
  static isOperationalError(error: Error): boolean {
    if (error instanceof AppError) {
      return error.isOperational;
    }
    return false;
  }
}

/**
 * Predefined error creators
 */
export class ErrorFactory {
  static validationError(message: string, context?: any): AppError {
    return new AppError(message, ErrorType.VALIDATION, 400, true, context);
  }

  static authenticationError(message: string, context?: any): AppError {
    return new AppError(message, ErrorType.AUTHENTICATION, 401, true, context);
  }

  static authorizationError(message: string, context?: any): AppError {
    return new AppError(message, ErrorType.AUTHORIZATION, 403, true, context);
  }

  static notFoundError(message: string, context?: any): AppError {
    return new AppError(message, ErrorType.NOT_FOUND, 404, true, context);
  }

  static conflictError(message: string, context?: any): AppError {
    return new AppError(message, ErrorType.CONFLICT, 409, true, context);
  }

  static internalError(message: string, context?: any): AppError {
    return new AppError(message, ErrorType.INTERNAL, 500, false, context);
  }

  static networkError(message: string, context?: any): AppError {
    return new AppError(message, ErrorType.NETWORK, 503, true, context);
  }

  static timeoutError(message: string, context?: any): AppError {
    return new AppError(message, ErrorType.TIMEOUT, 408, true, context);
  }
}

/**
 * Error recovery strategies
 */
export class ErrorRecovery {
  /**
   * Attempt to recover from error
   */
  static async attemptRecovery(
    error: Error,
    recoveryFn: () => Promise<void>,
    maxAttempts: number = 3
  ): Promise<boolean> {
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        await recoveryFn();
        logger.info('Error recovery successful', { attempts: attempts + 1 });
        return true;
      } catch (recoveryError) {
        attempts++;
        logger.warn('Error recovery attempt failed', {
          attempt: attempts,
          maxAttempts,
          error: recoveryError,
        });

        if (attempts >= maxAttempts) {
          logger.error('Error recovery failed after max attempts', {
            originalError: error,
            maxAttempts,
          });
          return false;
        }

        // Wait before retrying (exponential backoff)
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempts) * 1000));
      }
    }

    return false;
  }
}

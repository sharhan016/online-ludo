import { isDevelopment } from '../config';

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

class Logger {
  private log(level: LogLevel, message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}`;

    if (data) {
      console.log(logMessage, data);
    } else {
      console.log(logMessage);
    }
  }

  debug(message: string, data?: any): void {
    if (isDevelopment) {
      this.log(LogLevel.DEBUG, message, data);
    }
  }

  info(message: string, data?: any): void {
    this.log(LogLevel.INFO, message, data);
  }

  warn(message: string, data?: any): void {
    this.log(LogLevel.WARN, message, data);
  }

  error(message: string, error?: any): void {
    this.log(LogLevel.ERROR, message, error);
  }
}

export const logger = new Logger();

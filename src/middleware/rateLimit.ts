import { Socket } from 'socket.io';
import { logger } from '../utils/logger';

/**
 * Rate limiting middleware for socket events
 * Limits actions per socket to prevent abuse
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
  blocked: boolean;
  blockUntil?: number;
}

export class RateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map();
  private readonly MAX_ACTIONS_PER_SECOND = 10;
  private readonly WINDOW_MS = 1000; // 1 second
  private readonly BLOCK_DURATION_MS = 5000; // 5 seconds block for violators
  private readonly CLEANUP_INTERVAL_MS = 60000; // Clean up old entries every minute

  constructor() {
    // Start cleanup interval
    setInterval(() => this.cleanup(), this.CLEANUP_INTERVAL_MS);
  }

  /**
   * Check if action is allowed for socket
   */
  checkLimit(socketId: string): { allowed: boolean; reason?: string } {
    const now = Date.now();
    const entry = this.limits.get(socketId);

    // Check if socket is blocked
    if (entry?.blocked) {
      if (entry.blockUntil && now < entry.blockUntil) {
        return {
          allowed: false,
          reason: `Rate limit exceeded. Blocked until ${new Date(entry.blockUntil).toISOString()}`,
        };
      } else {
        // Unblock and reset
        entry.blocked = false;
        entry.blockUntil = undefined;
        entry.count = 0;
        entry.resetTime = now + this.WINDOW_MS;
      }
    }

    // Initialize or reset if window expired
    if (!entry || now >= entry.resetTime) {
      this.limits.set(socketId, {
        count: 1,
        resetTime: now + this.WINDOW_MS,
        blocked: false,
      });
      return { allowed: true };
    }

    // Increment count
    entry.count++;

    // Check if limit exceeded
    if (entry.count > this.MAX_ACTIONS_PER_SECOND) {
      entry.blocked = true;
      entry.blockUntil = now + this.BLOCK_DURATION_MS;
      
      logger.warn('Rate limit exceeded, socket blocked', {
        socketId,
        count: entry.count,
        blockUntil: new Date(entry.blockUntil).toISOString(),
      });

      return {
        allowed: false,
        reason: `Rate limit exceeded (${this.MAX_ACTIONS_PER_SECOND} actions per second). Blocked for ${this.BLOCK_DURATION_MS / 1000} seconds.`,
      };
    }

    return { allowed: true };
  }

  /**
   * Remove rate limit entry for socket (on disconnect)
   */
  removeSocket(socketId: string): void {
    this.limits.delete(socketId);
  }

  /**
   * Clean up old entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [socketId, entry] of this.limits.entries()) {
      // Remove entries that are not blocked and past their reset time
      if (!entry.blocked && now >= entry.resetTime + this.WINDOW_MS * 2) {
        this.limits.delete(socketId);
        cleanedCount++;
      }
      // Remove entries that were blocked but block period has expired
      else if (entry.blocked && entry.blockUntil && now >= entry.blockUntil + this.WINDOW_MS * 2) {
        this.limits.delete(socketId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug('Rate limiter cleanup completed', { cleanedCount, remainingEntries: this.limits.size });
    }
  }

  /**
   * Get current stats
   */
  getStats(): { totalEntries: number; blockedSockets: number } {
    let blockedCount = 0;
    for (const entry of this.limits.values()) {
      if (entry.blocked) {
        blockedCount++;
      }
    }
    return {
      totalEntries: this.limits.size,
      blockedSockets: blockedCount,
    };
  }
}

// Export singleton instance
export const rateLimiter = new RateLimiter();

/**
 * Middleware function to check rate limit
 */
export function checkRateLimit(socket: Socket): { allowed: boolean; reason?: string } {
  return rateLimiter.checkLimit(socket.id);
}

/**
 * Handle rate limit exceeded
 */
export function handleRateLimitExceeded(socket: Socket, reason: string): void {
  socket.emit('error', {
    message: reason,
    code: 'RATE_LIMIT_EXCEEDED',
  });

  logger.warn('Rate limit exceeded for socket', {
    socketId: socket.id,
    address: socket.handshake.address,
  });
}

import { createClient, RedisClientType } from 'redis';
import { config } from '../config';
import { logger } from './logger';

class RedisClient {
  private client: RedisClientType | null = null;
  private isConnected = false;

  /**
   * Initialize Redis connection
   */
  async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      logger.warn('Redis client already connected');
      return;
    }

    try {
      // Use REDIS_URL if available (Upstash/cloud), otherwise use host/port (local dev)
      if (config.redis.url) {
        logger.info('Connecting to Redis using URL (Upstash)');
        this.client = createClient({
          url: config.redis.url,
          socket: {
            tls: true,
            rejectUnauthorized: true,
            // Retry strategy for cloud deployments
            reconnectStrategy: (retries) => {
              if (retries > 10) {
                logger.error('Redis max reconnection attempts reached');
                return new Error('Max reconnection attempts reached');
              }
              const delay = Math.min(retries * 100, 3000);
              logger.info(`Redis reconnecting in ${delay}ms (attempt ${retries})`);
              return delay;
            },
          },
        });
      } else {
        logger.info('Connecting to Redis using host/port (local)');
        this.client = createClient({
          socket: {
            host: config.redis.host,
            port: config.redis.port,
          },
          password: config.redis.password,
        });
      }

      // Error handler
      this.client.on('error', (err) => {
        logger.error('Redis client error', err);
        this.isConnected = false;
      });

      // Connect event
      this.client.on('connect', () => {
        logger.info('Redis client connecting...');
      });

      // Ready event
      this.client.on('ready', () => {
        logger.info('Redis client ready');
        this.isConnected = true;
      });

      // Reconnecting event
      this.client.on('reconnecting', () => {
        logger.warn('Redis client reconnecting...');
        this.isConnected = false;
      });

      // End event (connection closed)
      this.client.on('end', () => {
        logger.warn('Redis connection closed');
        this.isConnected = false;
      });

      await this.client.connect();
      logger.info('Redis connection established successfully');
    } catch (error) {
      logger.error('Failed to connect to Redis', error);
      throw error;
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
      logger.info('Redis client disconnected');
    }
  }

  /**
   * Ensure client is connected, attempt reconnect if needed
   */
  private async ensureConnected(): Promise<void> {
    if (this.client && this.isConnected) {
      return;
    }

    if (this.client && !this.isConnected) {
      logger.warn('Redis client exists but not connected, attempting reconnect...');
      try {
        if (!this.client.isOpen) {
          await this.client.connect();
        }
        return;
      } catch (error) {
        logger.error('Failed to reconnect existing client', error);
        // Fall through to create new client
      }
    }

    logger.warn('Redis client not available, creating new connection...');
    await this.connect();
  }

  /**
   * Get value by key
   */
  async get(key: string): Promise<string | null> {
    await this.ensureConnected();
    return await this.client!.get(key);
  }

  /**
   * Get JSON value by key
   */
  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch (error) {
      logger.error(`Failed to parse JSON for key: ${key}`, error);
      return null;
    }
  }

  /**
   * Set value with optional expiration
   */
  async set(key: string, value: string, ttl?: number): Promise<void> {
    await this.ensureConnected();

    if (ttl) {
      await this.client!.setEx(key, ttl, value);
    } else {
      await this.client!.set(key, value);
    }
  }

  /**
   * Set JSON value with optional expiration
   */
  async setJson(key: string, value: any, ttl?: number): Promise<void> {
    const jsonString = JSON.stringify(value);
    await this.set(key, jsonString, ttl);
  }

  /**
   * Delete key
   */
  async delete(key: string): Promise<void> {
    await this.ensureConnected();
    await this.client!.del(key);
  }

  /**
   * Delete multiple keys
   */
  async deleteMany(keys: string[]): Promise<void> {
    await this.ensureConnected();
    if (keys.length > 0) {
      await this.client!.del(keys);
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    await this.ensureConnected();
    const result = await this.client!.exists(key);
    return result === 1;
  }

  /**
   * Set expiration on key
   */
  async expire(key: string, seconds: number): Promise<void> {
    await this.ensureConnected();
    await this.client!.expire(key, seconds);
  }

  /**
   * Get all keys matching pattern
   */
  async keys(pattern: string): Promise<string[]> {
    await this.ensureConnected();
    return await this.client!.keys(pattern);
  }

  /**
   * Add value to set
   */
  async sAdd(key: string, value: string): Promise<void> {
    await this.ensureConnected();
    await this.client!.sAdd(key, value);
  }

  /**
   * Remove value from set
   */
  async sRem(key: string, value: string): Promise<void> {
    await this.ensureConnected();
    await this.client!.sRem(key, value);
  }

  /**
   * Get all members of set
   */
  async sMembers(key: string): Promise<string[]> {
    await this.ensureConnected();
    return await this.client!.sMembers(key);
  }

  /**
   * Get set size
   */
  async sCard(key: string): Promise<number> {
    await this.ensureConnected();
    return await this.client!.sCard(key);
  }

  /**
   * Add member to sorted set with score
   */
  async zAdd(key: string, score: number, member: string): Promise<void> {
    await this.ensureConnected();
    await this.client!.zAdd(key, { score, value: member });
  }

  /**
   * Remove member from sorted set
   */
  async zRem(key: string, member: string): Promise<void> {
    await this.ensureConnected();
    await this.client!.zRem(key, member);
  }

  /**
   * Get members from sorted set by score range
   */
  async zRangeByScore(key: string, min: number, max: number): Promise<string[]> {
    await this.ensureConnected();
    return await this.client!.zRangeByScore(key, min, max);
  }

  /**
   * Get all members from sorted set ordered by score
   */
  async zRange(key: string, start: number, stop: number): Promise<string[]> {
    await this.ensureConnected();
    return await this.client!.zRange(key, start, stop);
  }

  /**
   * Get sorted set size
   */
  async zCard(key: string): Promise<number> {
    await this.ensureConnected();
    return await this.client!.zCard(key);
  }

  /**
   * Check connection status
   */
  isReady(): boolean {
    return this.isConnected;
  }
}

// Export singleton instance
export const redisClient = new RedisClient();

/**
 * Redis key prefixes for different data types
 */
export const RedisKeys = {
  room: (roomCode: string) => `room:${roomCode}`,
  gameState: (roomCode: string) => `game:${roomCode}`,
  playerSession: (playerId: string) => `session:${playerId}`,
  matchmakingQueue: () => `queue:matchmaking`,
  matchmakingPlayer: (playerId: string) => `queue:player:${playerId}`,
  allRooms: () => 'rooms:*',
  allSessions: () => 'session:*',
};

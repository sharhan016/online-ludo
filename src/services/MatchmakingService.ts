import { redisClient, RedisKeys } from '../utils/redis';
import { logger } from '../utils/logger';
import { RoomService } from './RoomService';

/**
 * Player in matchmaking queue
 */
export interface QueuedPlayer {
  playerId: string;
  playerName: string;
  preferredPlayers: number; // 2, 3, or 4
  timestamp: number;
}

/**
 * Matchmaking service
 * Handles player queue management and automatic room creation
 */
export class MatchmakingService {
  private roomService: RoomService;

  constructor() {
    this.roomService = new RoomService();
  }

  /**
   * Add player to matchmaking queue
   */
  async addToQueue(playerId: string, playerName: string, preferredPlayers: number = 4): Promise<void> {
    if (!playerId || !playerName) {
      throw new Error('Player ID and name are required');
    }

    if (![2, 3, 4].includes(preferredPlayers)) {
      throw new Error('Preferred players must be 2, 3, or 4');
    }

    // Check if player is already in queue
    const existingPlayer = await redisClient.getJson<QueuedPlayer>(RedisKeys.matchmakingPlayer(playerId));
    if (existingPlayer) {
      logger.warn('Player already in matchmaking queue', { playerId });
      return;
    }

    const timestamp = Date.now();
    const queuedPlayer: QueuedPlayer = {
      playerId,
      playerName,
      preferredPlayers,
      timestamp,
    };

    // Store player data
    await redisClient.setJson(RedisKeys.matchmakingPlayer(playerId), queuedPlayer, 300); // 5 minutes TTL

    // Add to sorted set (score is timestamp for FIFO ordering)
    await redisClient.zAdd(RedisKeys.matchmakingQueue(), timestamp, playerId);

    logger.info('Player added to matchmaking queue', { playerId, playerName, preferredPlayers, queueSize: await this.getQueueSize() });
  }

  /**
   * Remove player from matchmaking queue
   */
  async removeFromQueue(playerId: string): Promise<void> {
    if (!playerId) {
      throw new Error('Player ID is required');
    }

    // Remove from sorted set
    await redisClient.zRem(RedisKeys.matchmakingQueue(), playerId);

    // Remove player data
    await redisClient.delete(RedisKeys.matchmakingPlayer(playerId));

    logger.info('Player removed from matchmaking queue', { playerId });
  }

  /**
   * Get current queue size
   */
  async getQueueSize(): Promise<number> {
    return await redisClient.zCard(RedisKeys.matchmakingQueue());
  }

  /**
   * Get all players in queue
   */
  private async getQueuedPlayers(): Promise<QueuedPlayer[]> {
    // Get all player IDs from sorted set (ordered by timestamp)
    const playerIds = await redisClient.zRange(RedisKeys.matchmakingQueue(), 0, -1);

    const players: QueuedPlayer[] = [];
    for (const playerId of playerIds) {
      const player = await redisClient.getJson<QueuedPlayer>(RedisKeys.matchmakingPlayer(playerId));
      if (player) {
        players.push(player);
      } else {
        // Clean up orphaned entry
        await redisClient.zRem(RedisKeys.matchmakingQueue(), playerId);
      }
    }

    return players;
  }

  /**
   * Find match for players in queue
   * Prioritizes 4-player matches, then 3-player, then 2-player
   */
  async findMatch(): Promise<QueuedPlayer[] | null> {
    const queuedPlayers = await this.getQueuedPlayers();

    if (queuedPlayers.length < 2) {
      return null;
    }

    // Try to find 4-player match first
    const fourPlayerMatch = this.findMatchBySize(queuedPlayers, 4);
    if (fourPlayerMatch) {
      logger.info('Found 4-player match', { playerIds: fourPlayerMatch.map(p => p.playerId) });
      return fourPlayerMatch;
    }

    // Try to find 3-player match
    const threePlayerMatch = this.findMatchBySize(queuedPlayers, 3);
    if (threePlayerMatch) {
      logger.info('Found 3-player match', { playerIds: threePlayerMatch.map(p => p.playerId) });
      return threePlayerMatch;
    }

    // Try to find 2-player match
    const twoPlayerMatch = this.findMatchBySize(queuedPlayers, 2);
    if (twoPlayerMatch) {
      logger.info('Found 2-player match', { playerIds: twoPlayerMatch.map(p => p.playerId) });
      return twoPlayerMatch;
    }

    return null;
  }

  /**
   * Find match of specific size
   */
  private findMatchBySize(players: QueuedPlayer[], size: number): QueuedPlayer[] | null {
    if (players.length < size) {
      return null;
    }

    // Filter players who prefer this size or don't mind (prefer 4 but accept smaller)
    const eligiblePlayers = players.filter(p => p.preferredPlayers >= size || p.preferredPlayers === size);

    if (eligiblePlayers.length >= size) {
      // Return the oldest players (FIFO)
      return eligiblePlayers.slice(0, size);
    }

    return null;
  }

  /**
   * Create room for matched players
   */
  async createMatchedRoom(players: QueuedPlayer[]): Promise<string> {
    if (players.length < 2 || players.length > 4) {
      throw new Error('Invalid number of players for match');
    }

    // First player becomes host
    const host = players[0];
    const room = await this.roomService.createRoom({
      hostId: host.playerId,
      maxPlayers: players.length,
    });

    // Add other players to room
    for (let i = 1; i < players.length; i++) {
      const player = players[i];
      try {
        await this.roomService.joinRoom(room.roomCode, player.playerId, player.playerName);
      } catch (error) {
        logger.error('Failed to add player to matched room', { playerId: player.playerId, roomCode: room.roomCode, error });
      }
    }

    // Remove all matched players from queue
    for (const player of players) {
      await this.removeFromQueue(player.playerId);
    }

    logger.info('Created room for matched players', { roomCode: room.roomCode, playerCount: players.length });

    return room.roomCode;
  }
}

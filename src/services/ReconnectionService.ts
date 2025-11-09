import { redisClient, RedisKeys } from '../utils/redis';
import { logger } from '../utils/logger';
import { PlayerSession, ConnectionStatus } from '../models/Player';
import { GameService } from './GameService';

/**
 * Reconnection service
 * Handles player reconnection and state restoration
 */
export class ReconnectionService {
  private gameService: GameService;
  private readonly DISCONNECT_GRACE_PERIOD = 60000; // 60 seconds in milliseconds
  private disconnectionTimers: Map<string, NodeJS.Timeout> = new Map();
  private permanentDisconnectCallback?: (playerId: string, roomCode: string) => void;

  constructor() {
    this.gameService = new GameService();
  }

  /**
   * Set callback for permanent disconnection notifications
   */
  setPermanentDisconnectCallback(callback: (playerId: string, roomCode: string) => void): void {
    this.permanentDisconnectCallback = callback;
  }

  /**
   * Store player session mapping socket ID to player ID
   */
  async storePlayerSession(socketId: string, playerId: string, playerName: string, roomCode?: string): Promise<void> {
    const session: PlayerSession = {
      playerId,
      playerName,
      roomCode,
      socketId,
      lastActivity: new Date(),
    };

    await redisClient.setJson(RedisKeys.playerSession(playerId), session, 3600); // 1 hour TTL
    logger.debug('Player session stored', { playerId, socketId, roomCode });
  }

  /**
   * Get player session by player ID
   */
  async getPlayerSession(playerId: string): Promise<PlayerSession | null> {
    return await redisClient.getJson<PlayerSession>(RedisKeys.playerSession(playerId));
  }

  /**
   * Update player connection status in game state
   */
  async updatePlayerConnectionStatus(roomCode: string, playerId: string, status: ConnectionStatus): Promise<void> {
    try {
      const gameState = await this.gameService.getGameState(roomCode);
      
      if (!gameState) {
        logger.warn('Game state not found for connection status update', { roomCode, playerId });
        return;
      }

      // Update player connection status
      const playerIndex = gameState.players.findIndex(p => p.playerId === playerId);
      if (playerIndex !== -1) {
        gameState.players[playerIndex].connectionStatus = status;
        await this.gameService.saveGameState(gameState);
        logger.info('Player connection status updated', { roomCode, playerId, status });
      }
    } catch (error) {
      logger.error('Error updating player connection status', { roomCode, playerId, status, error });
    }
  }

  /**
   * Handle player disconnection with grace period
   */
  async handleDisconnection(socketId: string, playerId: string, roomCode: string): Promise<void> {
    logger.info('Player disconnected, starting grace period', { playerId, roomCode, socketId });

    // Update connection status to disconnected
    await this.updatePlayerConnectionStatus(roomCode, playerId, ConnectionStatus.DISCONNECTED);

    // Clear any existing timer for this player
    const existingTimer = this.disconnectionTimers.get(playerId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Start grace period timer
    const timer = setTimeout(async () => {
      await this.handlePermanentDisconnection(playerId, roomCode);
      this.disconnectionTimers.delete(playerId);
    }, this.DISCONNECT_GRACE_PERIOD);

    this.disconnectionTimers.set(playerId, timer);
  }

  /**
   * Handle permanent disconnection after grace period expires
   */
  private async handlePermanentDisconnection(playerId: string, roomCode: string): Promise<void> {
    logger.info('Grace period expired, removing player permanently', { playerId, roomCode });

    try {
      const gameState = await this.gameService.getGameState(roomCode);
      
      if (!gameState) {
        logger.warn('Game state not found for permanent disconnection', { roomCode, playerId });
        return;
      }

      // Remove player from game state
      gameState.players = gameState.players.filter(p => p.playerId !== playerId);

      // If it was the disconnected player's turn, advance to next player
      if (gameState.players.length > 0) {
        if (gameState.currentPlayerIndex >= gameState.players.length) {
          gameState.currentPlayerIndex = 0;
        }
        await this.gameService.saveGameState(gameState);
      }

      // Clean up player session
      await redisClient.delete(RedisKeys.playerSession(playerId));

      logger.info('Player permanently removed from game', { playerId, roomCode, remainingPlayers: gameState.players.length });

      // Notify via callback if set
      if (this.permanentDisconnectCallback) {
        this.permanentDisconnectCallback(playerId, roomCode);
      }
    } catch (error) {
      logger.error('Error handling permanent disconnection', { playerId, roomCode, error });
    }
  }

  /**
   * Cancel disconnection timer when player reconnects
   */
  cancelDisconnectionTimer(playerId: string): void {
    const timer = this.disconnectionTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectionTimers.delete(playerId);
      logger.debug('Disconnection timer cancelled', { playerId });
    }
  }

  /**
   * Check if player has an active session in a room
   */
  async hasActiveSession(playerId: string, roomCode: string): Promise<boolean> {
    const session = await this.getPlayerSession(playerId);
    return session !== null && session.roomCode === roomCode;
  }

  /**
   * Update socket ID for reconnected player
   */
  async updateSocketId(playerId: string, newSocketId: string): Promise<void> {
    const session = await this.getPlayerSession(playerId);
    
    if (session) {
      session.socketId = newSocketId;
      session.lastActivity = new Date();
      await redisClient.setJson(RedisKeys.playerSession(playerId), session, 3600);
      logger.debug('Socket ID updated for player', { playerId, newSocketId });
    }
  }

  /**
   * Clean up all timers (for graceful shutdown)
   */
  cleanup(): void {
    for (const [playerId, timer] of this.disconnectionTimers.entries()) {
      clearTimeout(timer);
      logger.debug('Cleaned up disconnection timer', { playerId });
    }
    this.disconnectionTimers.clear();
  }
}

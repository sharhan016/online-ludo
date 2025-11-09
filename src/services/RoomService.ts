import { Room, RoomStatus, CreateRoomParams, RoomWithPlayers } from '../models/Room';
import { Player, PlayerColor, ConnectionStatus } from '../models/Player';
import { redisClient, RedisKeys } from '../utils/redis';
import { generateRoomCode, isValidRoomCode, isValidPlayerId, isValidPlayerName } from '../utils/validation';
import { logger } from '../utils/logger';

/**
 * Room management service
 * Handles room creation, joining, leaving, and state management
 */
export class RoomService {
  private readonly ROOM_TTL = 3600; // 1 hour in seconds

  /**
   * Generate a unique room code
   */
  private async generateUniqueRoomCode(): Promise<string> {
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      const roomCode = generateRoomCode();
      const exists = await redisClient.exists(RedisKeys.room(roomCode));
      
      if (!exists) {
        return roomCode;
      }
      
      attempts++;
    }

    throw new Error('Failed to generate unique room code');
  }

  /**
   * Create a new room
   */
  async createRoom(params: CreateRoomParams): Promise<Room> {
    const { hostId, maxPlayers = 4 } = params;

    if (!isValidPlayerId(hostId)) {
      throw new Error('Invalid host ID');
    }

    if (maxPlayers < 2 || maxPlayers > 4) {
      throw new Error('Max players must be between 2 and 4');
    }

    // Generate unique room code
    const roomCode = await this.generateUniqueRoomCode();

    // Create room object
    const room: Room = {
      roomCode,
      hostId,
      players: [hostId],
      status: RoomStatus.WAITING,
      maxPlayers,
      createdAt: new Date(),
    };

    // Store room in Redis
    await redisClient.setJson(RedisKeys.room(roomCode), room, this.ROOM_TTL);

    logger.info('Room created', { roomCode, hostId, maxPlayers });

    return room;
  }

  /**
   * Join an existing room
   */
  async joinRoom(roomCode: string, playerId: string, playerName: string): Promise<Room> {
    if (!isValidRoomCode(roomCode)) {
      throw new Error('Invalid room code format');
    }

    if (!isValidPlayerId(playerId)) {
      throw new Error('Invalid player ID');
    }

    if (!isValidPlayerName(playerName)) {
      throw new Error('Invalid player name');
    }

    // Get room from Redis
    const room = await redisClient.getJson<Room>(RedisKeys.room(roomCode));

    if (!room) {
      throw new Error('Room not found');
    }

    // Check if room is full
    if (room.players.length >= room.maxPlayers) {
      throw new Error('Room is full');
    }

    // Check if player already in room
    if (room.players.includes(playerId)) {
      logger.warn('Player already in room', { roomCode, playerId });
      return room;
    }

    // Check if game already started
    if (room.status !== RoomStatus.WAITING) {
      throw new Error('Game already started');
    }

    // Add player to room
    room.players.push(playerId);

    // Update room in Redis
    await redisClient.setJson(RedisKeys.room(roomCode), room, this.ROOM_TTL);

    logger.info('Player joined room', { roomCode, playerId, playerName, playerCount: room.players.length });

    return room;
  }

  /**
   * Leave a room
   */
  async leaveRoom(roomCode: string, playerId: string): Promise<Room | null> {
    if (!isValidRoomCode(roomCode)) {
      throw new Error('Invalid room code format');
    }

    if (!isValidPlayerId(playerId)) {
      throw new Error('Invalid player ID');
    }

    // Get room from Redis
    const room = await redisClient.getJson<Room>(RedisKeys.room(roomCode));

    if (!room) {
      throw new Error('Room not found');
    }

    // Check if player is in room
    if (!room.players.includes(playerId)) {
      logger.warn('Player not in room', { roomCode, playerId });
      return room;
    }

    // Remove player from room
    room.players = room.players.filter(id => id !== playerId);

    // If room is empty, delete it
    if (room.players.length === 0) {
      await redisClient.delete(RedisKeys.room(roomCode));
      logger.info('Room deleted (empty)', { roomCode });
      return null;
    }

    // If host left, promote next player to host
    if (room.hostId === playerId) {
      room.hostId = room.players[0];
      logger.info('Host promoted', { roomCode, newHostId: room.hostId });
    }

    // Update room in Redis
    await redisClient.setJson(RedisKeys.room(roomCode), room, this.ROOM_TTL);

    logger.info('Player left room', { roomCode, playerId, remainingPlayers: room.players.length });

    return room;
  }

  /**
   * Get room data
   */
  async getRoomData(roomCode: string): Promise<Room | null> {
    if (!isValidRoomCode(roomCode)) {
      throw new Error('Invalid room code format');
    }

    const room = await redisClient.getJson<Room>(RedisKeys.room(roomCode));
    
    if (!room) {
      return null;
    }

    return room;
  }

  /**
   * Update room status
   */
  async updateRoomStatus(roomCode: string, status: RoomStatus): Promise<Room> {
    if (!isValidRoomCode(roomCode)) {
      throw new Error('Invalid room code format');
    }

    const room = await redisClient.getJson<Room>(RedisKeys.room(roomCode));

    if (!room) {
      throw new Error('Room not found');
    }

    room.status = status;

    await redisClient.setJson(RedisKeys.room(roomCode), room, this.ROOM_TTL);

    logger.info('Room status updated', { roomCode, status });

    return room;
  }

  /**
   * Check if player is host
   */
  async isHost(roomCode: string, playerId: string): Promise<boolean> {
    const room = await this.getRoomData(roomCode);
    return room?.hostId === playerId;
  }

  /**
   * Get all rooms (for cleanup)
   */
  async getAllRooms(): Promise<Room[]> {
    const keys = await redisClient.keys('room:*');
    const rooms: Room[] = [];

    for (const key of keys) {
      const room = await redisClient.getJson<Room>(key);
      if (room) {
        rooms.push(room);
      }
    }

    return rooms;
  }

  /**
   * Clean up abandoned rooms
   * Rooms are considered abandoned if they've been in WAITING status for too long
   */
  async cleanupAbandonedRooms(): Promise<number> {
    const rooms = await this.getAllRooms();
    let cleanedCount = 0;

    const now = new Date();

    for (const room of rooms) {
      // Only clean up rooms in WAITING status
      if (room.status !== RoomStatus.WAITING) {
        continue;
      }

      const roomAge = now.getTime() - new Date(room.createdAt).getTime();
      const ageInMinutes = roomAge / (1000 * 60);

      // Clean up rooms older than 5 minutes
      if (ageInMinutes > 5) {
        await redisClient.delete(RedisKeys.room(room.roomCode));
        logger.info('Abandoned room cleaned up', { roomCode: room.roomCode, ageInMinutes });
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info('Cleanup completed', { cleanedCount });
    }

    return cleanedCount;
  }

  /**
   * Add spectator to room
   */
  async addSpectator(roomCode: string, playerId: string, playerName: string): Promise<Room> {
    if (!isValidRoomCode(roomCode)) {
      throw new Error('Invalid room code format');
    }

    if (!isValidPlayerId(playerId)) {
      throw new Error('Invalid player ID');
    }

    if (!isValidPlayerName(playerName)) {
      throw new Error('Invalid player name');
    }

    // Get room from Redis
    const room = await redisClient.getJson<Room>(RedisKeys.room(roomCode));

    if (!room) {
      throw new Error('Room not found');
    }

    // Initialize spectators array if it doesn't exist
    if (!room.spectators) {
      room.spectators = [];
    }

    // Check if already a spectator
    if (room.spectators.includes(playerId)) {
      logger.warn('Player already a spectator', { roomCode, playerId });
      return room;
    }

    // Check if player is already in the game
    if (room.players.includes(playerId)) {
      throw new Error('Player is already in the game');
    }

    // Add spectator
    room.spectators.push(playerId);

    // Update room in Redis
    await redisClient.setJson(RedisKeys.room(roomCode), room, this.ROOM_TTL);

    logger.info('Spectator added to room', { roomCode, playerId, playerName, spectatorCount: room.spectators.length });

    return room;
  }

  /**
   * Remove spectator from room
   */
  async removeSpectator(roomCode: string, playerId: string): Promise<Room | null> {
    if (!isValidRoomCode(roomCode)) {
      throw new Error('Invalid room code format');
    }

    if (!isValidPlayerId(playerId)) {
      throw new Error('Invalid player ID');
    }

    // Get room from Redis
    const room = await redisClient.getJson<Room>(RedisKeys.room(roomCode));

    if (!room) {
      throw new Error('Room not found');
    }

    // Check if spectators array exists
    if (!room.spectators) {
      logger.warn('No spectators in room', { roomCode, playerId });
      return room;
    }

    // Check if player is a spectator
    if (!room.spectators.includes(playerId)) {
      logger.warn('Player not a spectator', { roomCode, playerId });
      return room;
    }

    // Remove spectator
    room.spectators = room.spectators.filter(id => id !== playerId);

    // Update room in Redis
    await redisClient.setJson(RedisKeys.room(roomCode), room, this.ROOM_TTL);

    logger.info('Spectator removed from room', { roomCode, playerId, remainingSpectators: room.spectators.length });

    return room;
  }

  /**
   * Check if room is full (for player slots, not spectators)
   */
  async isRoomFull(roomCode: string): Promise<boolean> {
    const room = await this.getRoomData(roomCode);
    if (!room) {
      return false;
    }
    return room.players.length >= room.maxPlayers;
  }

  /**
   * Enrich room data with full player information for client response
   */
  async enrichRoomWithPlayers(room: Room, playerName?: string): Promise<RoomWithPlayers> {
    const availableColors = [PlayerColor.RED, PlayerColor.BLUE, PlayerColor.GREEN, PlayerColor.YELLOW];
    const usedColors: PlayerColor[] = [];

    const players: Player[] = await Promise.all(
      room.players.map(async (playerId, index) => {
        // Get player session to retrieve player name
        const sessionKey = `player:${playerId}:session`;
        const session = await redisClient.getJson<any>(sessionKey);
        
        // Assign color (cycle through available colors)
        const color = availableColors[index % availableColors.length];
        usedColors.push(color);

        return {
          playerId,
          playerName: session?.playerName || playerName || 'Player',
          color,
          connectionStatus: ConnectionStatus.CONNECTED,
          isSpectator: false,
          rank: 0,
        };
      })
    );

    return {
      roomCode: room.roomCode,
      hostId: room.hostId,
      players,
      status: room.status,
      maxPlayers: room.maxPlayers,
      createdAt: room.createdAt,
    };
  }
}

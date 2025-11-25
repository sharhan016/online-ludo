import { Socket } from 'socket.io';
import { RoomService } from '../services/RoomService';
import { GameService } from '../services/GameService';
import { ReconnectionService } from '../services/ReconnectionService';
import { RoomStatus } from '../models/Room';
import { PlayerColor } from '../models/Player';
import { logger } from '../utils/logger';

const roomService = new RoomService();
const gameService = new GameService();
const reconnectionService = new ReconnectionService();

/**
 * Room event handlers
 */

/**
 * Handle create room event
 */
export function handleCreateRoom(socket: Socket): void {
  socket.on('create_room', async (data, callback) => {
    try {
      logger.debug('create_room event received', { socketId: socket.id, data });

      const { playerId, playerName, maxPlayers } = data;

      if (!playerId) {
        const error = { error: 'Player ID is required' };
        logger.warn('create_room failed: missing playerId', { socketId: socket.id });
        if (callback) callback(error);
        return;
      }

      if (!playerName) {
        const error = { error: 'Player name is required' };
        logger.warn('create_room failed: missing playerName', { socketId: socket.id });
        if (callback) callback(error);
        return;
      }

      // Create room
      const room = await roomService.createRoom({
        hostId: playerId,
        maxPlayers: maxPlayers || 4,
      });

      // Join socket to room channel
      socket.join(room.roomCode);

      // Store room code in socket data
      socket.data.roomCode = room.roomCode;
      socket.data.playerId = playerId;

      // Store player session for reconnection tracking
      await reconnectionService.storePlayerSession(socket.id, playerId, playerName, room.roomCode);

      // Enrich room with player data for client
      const enrichedRoom = await roomService.enrichRoomWithPlayers(room, playerName);

      // Send success response
      const response = {
        success: true,
        room: enrichedRoom,
      };

      logger.info('Room created successfully', { 
        roomCode: room.roomCode, 
        hostId: playerId,
        socketId: socket.id 
      });

      if (callback) callback(response);

      // Emit room_created event to the creator
      socket.emit('room_created', { room: enrichedRoom });

    } catch (error: any) {
      logger.error('create_room error', { socketId: socket.id, error: error.message });
      const errorResponse = { error: error.message || 'Failed to create room' };
      if (callback) callback(errorResponse);
    }
  });
}

/**
 * Handle join room event
 */
export function handleJoinRoom(socket: Socket): void {
  socket.on('join_room', async (data, callback) => {
    try {
      logger.debug('join_room event received', { socketId: socket.id, data });

      const { roomCode, playerId, playerName } = data;

      if (!roomCode) {
        const error = { error: 'Room code is required' };
        logger.warn('join_room failed: missing roomCode', { socketId: socket.id });
        if (callback) callback(error);
        return;
      }

      if (!playerId) {
        const error = { error: 'Player ID is required' };
        logger.warn('join_room failed: missing playerId', { socketId: socket.id });
        if (callback) callback(error);
        return;
      }

      if (!playerName) {
        const error = { error: 'Player name is required' };
        logger.warn('join_room failed: missing playerName', { socketId: socket.id });
        if (callback) callback(error);
        return;
      }

      // Join room
      const room = await roomService.joinRoom(roomCode, playerId, playerName);

      // Join socket to room channel
      socket.join(roomCode);

      // Store room code in socket data
      socket.data.roomCode = roomCode;
      socket.data.playerId = playerId;

      // Store player session for reconnection tracking
      await reconnectionService.storePlayerSession(socket.id, playerId, playerName, roomCode);

      // Enrich room with player data for client
      const enrichedRoom = await roomService.enrichRoomWithPlayers(room);

      // Send success response
      const response = {
        success: true,
        room: enrichedRoom,
      };

      logger.info('Player joined room successfully', { 
        roomCode, 
        playerId,
        playerName,
        socketId: socket.id 
      });

      if (callback) callback(response);

      // Broadcast player_joined event to all room members
      socket.to(roomCode).emit('player_joined', { room: enrichedRoom, player: { playerId, playerName } });

      // Also emit to the joining player
      socket.emit('player_joined', { room: enrichedRoom, player: { playerId, playerName } });

      // If room is now full, auto-start the game
      if (room.players.length >= room.maxPlayers) {
        logger.info('Room is full, auto-starting game', { roomCode, playerCount: room.players.length });
        
        // Update room status to playing
        await roomService.updateRoomStatus(roomCode, require('../models/Room').RoomStatus.PLAYING);
        
        // Get enriched room with player colors BEFORE initializing game
        const updatedRoom = await roomService.getRoomData(roomCode);
        const enrichedUpdatedRoom = await roomService.enrichRoomWithPlayers(updatedRoom!);
        
        // Initialize game state with proper Player objects (including colors)
        const { GameService } = require('../services/GameService');
        const gameService = new GameService();
        await gameService.initializeGame(roomCode, enrichedUpdatedRoom.players);
        
        // Notify all players that game is starting
        socket.to(roomCode).emit('game_started', { room: enrichedUpdatedRoom });
        socket.emit('game_started', { room: enrichedUpdatedRoom });
      }
      // If we now have enough players (but not full), notify that game can start
      else if (room.players.length >= 2) {
        socket.to(roomCode).emit('ready_to_start', { room: enrichedRoom });
        socket.emit('ready_to_start', { room: enrichedRoom });
      }

    } catch (error: any) {
      logger.error('join_room error', { socketId: socket.id, error: error.message });
      const errorResponse = { error: error.message || 'Failed to join room' };
      if (callback) callback(errorResponse);
    }
  });
}

/**
 * Handle leave room event
 */
export function handleLeaveRoom(socket: Socket): void {
  socket.on('leave_room', async (data, callback) => {
    try {
      logger.debug('leave_room event received', { socketId: socket.id, data });

      const { roomCode, playerId } = data;

      if (!roomCode) {
        const error = { error: 'Room code is required' };
        logger.warn('leave_room failed: missing roomCode', { socketId: socket.id });
        if (callback) callback(error);
        return;
      }

      if (!playerId) {
        const error = { error: 'Player ID is required' };
        logger.warn('leave_room failed: missing playerId', { socketId: socket.id });
        if (callback) callback(error);
        return;
      }

      // Leave room
      const room = await roomService.leaveRoom(roomCode, playerId);

      // Leave socket room channel
      socket.leave(roomCode);

      // Clear room code from socket data
      socket.data.roomCode = undefined;
      socket.data.playerId = undefined;

      // Send success response
      const response = {
        success: true,
        room,
      };

      logger.info('Player left room successfully', { 
        roomCode, 
        playerId,
        socketId: socket.id 
      });

      if (callback) callback(response);

      // If room still exists, broadcast update to remaining members
      if (room) {
        socket.to(roomCode).emit('room_updated', { room });
      }

      // Emit player_left event to remaining members
      socket.to(roomCode).emit('player_left', { playerId, roomCode });

    } catch (error: any) {
      logger.error('leave_room error', { socketId: socket.id, error: error.message });
      const errorResponse = { error: error.message || 'Failed to leave room' };
      if (callback) callback(errorResponse);
    }
  });
}

/**
 * Handle start game event
 */
export function handleStartGame(socket: Socket): void {
  socket.on('start_game', async (data, callback) => {
    try {
      logger.debug('start_game event received', { socketId: socket.id, data });

      const { roomCode, playerId } = data;

      if (!roomCode) {
        const error = { error: 'Room code is required' };
        logger.warn('start_game failed: missing roomCode', { socketId: socket.id });
        if (callback) callback(error);
        return;
      }

      if (!playerId) {
        const error = { error: 'Player ID is required' };
        logger.warn('start_game failed: missing playerId', { socketId: socket.id });
        if (callback) callback(error);
        return;
      }

      // Get room data
      const room = await roomService.getRoomData(roomCode);

      if (!room) {
        const error = { error: 'Room not found' };
        logger.warn('start_game failed: room not found', { roomCode, socketId: socket.id });
        if (callback) callback(error);
        return;
      }

      // Validate host
      if (room.hostId !== playerId) {
        const error = { error: 'Only the host can start the game' };
        logger.warn('start_game failed: not host', { roomCode, playerId, hostId: room.hostId });
        if (callback) callback(error);
        return;
      }

      // Validate minimum players
      if (room.players.length < 2) {
        const error = { error: 'At least 2 players required to start' };
        logger.warn('start_game failed: not enough players', { roomCode, playerCount: room.players.length });
        if (callback) callback(error);
        return;
      }

      // Update room status to PLAYING
      const updatedRoom = await roomService.updateRoomStatus(roomCode, RoomStatus.PLAYING);

      // Get enriched room with proper player colors
      const enrichedRoom = await roomService.enrichRoomWithPlayers(updatedRoom);

      // Initialize game state with players (with correct colors from enrichRoomWithPlayers)
      const gameState = await gameService.initializeGame(roomCode, enrichedRoom.players);

      // Send success response
      const response = {
        success: true,
        room: updatedRoom,
        gameState,
      };

      logger.info('Game started successfully', { 
        roomCode, 
        hostId: playerId,
        playerCount: updatedRoom.players.length,
        socketId: socket.id 
      });

      if (callback) callback(response);

      // Broadcast game_started event to all room members
      socket.to(roomCode).emit('game_started', { room: updatedRoom, gameState });
      socket.emit('game_started', { room: updatedRoom, gameState });

    } catch (error: any) {
      logger.error('start_game error', { socketId: socket.id, error: error.message });
      const errorResponse = { error: error.message || 'Failed to start game' };
      if (callback) callback(errorResponse);
    }
  });
}

/**
 * Handle spectate game event
 */
export function handleSpectateGame(socket: Socket): void {
  socket.on('spectate_game', async (data, callback) => {
    try {
      logger.debug('spectate_game event received', { socketId: socket.id, data });

      const { roomCode, playerId, playerName } = data;

      if (!roomCode) {
        const error = { error: 'Room code is required' };
        logger.warn('spectate_game failed: missing roomCode', { socketId: socket.id });
        if (callback) callback(error);
        return;
      }

      if (!playerId) {
        const error = { error: 'Player ID is required' };
        logger.warn('spectate_game failed: missing playerId', { socketId: socket.id });
        if (callback) callback(error);
        return;
      }

      if (!playerName) {
        const error = { error: 'Player name is required' };
        logger.warn('spectate_game failed: missing playerName', { socketId: socket.id });
        if (callback) callback(error);
        return;
      }

      // Check if room exists
      const room = await roomService.getRoomData(roomCode);
      if (!room) {
        const error = { error: 'Room not found' };
        logger.warn('spectate_game failed: room not found', { roomCode });
        if (callback) callback(error);
        return;
      }

      // Add as spectator
      const updatedRoom = await roomService.addSpectator(roomCode, playerId, playerName);

      // Join socket to room channel
      socket.join(roomCode);

      // Store room code and player ID in socket data
      socket.data.roomCode = roomCode;
      socket.data.playerId = playerId;
      socket.data.isSpectator = true;

      // Store player session for reconnection tracking
      await reconnectionService.storePlayerSession(socket.id, playerId, playerName, roomCode);

      // Get current game state if game is in progress
      let gameState = null;
      if (room.status === RoomStatus.PLAYING) {
        gameState = await gameService.getGameState(roomCode);
      }

      // Send success response
      const response = {
        success: true,
        room: updatedRoom,
        gameState,
        isSpectator: true,
      };

      logger.info('Spectator joined successfully', { 
        roomCode, 
        playerId,
        playerName,
        socketId: socket.id 
      });

      if (callback) callback(response);

      // Notify all room members about new spectator
      socket.to(roomCode).emit('spectator_joined', { 
        playerId, 
        playerName,
        roomCode,
        spectatorCount: updatedRoom.spectators?.length || 0
      });

      // Send current game state to spectator if game is in progress
      if (gameState) {
        socket.emit('game_state_update', { gameState });
      }

    } catch (error: any) {
      logger.error('spectate_game error', { socketId: socket.id, error: error.message });
      const errorResponse = { error: error.message || 'Failed to spectate game' };
      if (callback) callback(errorResponse);
    }
  });
}

/**
 * Handle leave spectator event
 */
export function handleLeaveSpectator(socket: Socket): void {
  socket.on('leave_spectator', async (data, callback) => {
    try {
      logger.debug('leave_spectator event received', { socketId: socket.id, data });

      const { roomCode, playerId } = data;

      if (!roomCode) {
        const error = { error: 'Room code is required' };
        logger.warn('leave_spectator failed: missing roomCode', { socketId: socket.id });
        if (callback) callback(error);
        return;
      }

      if (!playerId) {
        const error = { error: 'Player ID is required' };
        logger.warn('leave_spectator failed: missing playerId', { socketId: socket.id });
        if (callback) callback(error);
        return;
      }

      // Remove spectator
      const room = await roomService.removeSpectator(roomCode, playerId);

      // Leave socket room channel
      socket.leave(roomCode);

      // Clear socket data
      socket.data.roomCode = undefined;
      socket.data.playerId = undefined;
      socket.data.isSpectator = undefined;

      // Send success response
      const response = {
        success: true,
        room,
      };

      logger.info('Spectator left successfully', { 
        roomCode, 
        playerId,
        socketId: socket.id 
      });

      if (callback) callback(response);

      // Notify remaining members
      if (room) {
        socket.to(roomCode).emit('spectator_left', { 
          playerId, 
          roomCode,
          spectatorCount: room.spectators?.length || 0
        });
      }

    } catch (error: any) {
      logger.error('leave_spectator error', { socketId: socket.id, error: error.message });
      const errorResponse = { error: error.message || 'Failed to leave spectator mode' };
      if (callback) callback(errorResponse);
    }
  });
}

/**
 * Register all room event handlers
 */
export function registerRoomHandlers(socket: Socket): void {
  handleCreateRoom(socket);
  handleJoinRoom(socket);
  handleLeaveRoom(socket);
  handleStartGame(socket);
  handleSpectateGame(socket);
  handleLeaveSpectator(socket);
}

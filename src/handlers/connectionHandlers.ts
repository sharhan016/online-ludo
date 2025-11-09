import { Socket } from 'socket.io';
import { logger } from '../utils';
import { ReconnectionService } from '../services/ReconnectionService';
import { rateLimiter } from '../middleware/rateLimit';

const reconnectionService = new ReconnectionService();

/**
 * Handle new client connection
 */
export function handleConnection(socket: Socket): void {
  const clientInfo = {
    socketId: socket.id,
    address: socket.handshake.address,
    userAgent: socket.handshake.headers['user-agent'],
    timestamp: new Date().toISOString(),
  };

  logger.info('=== CLIENT CONNECTED ===', clientInfo);

  // Log all incoming events for debugging
  socket.onAny((eventName, ...args) => {
    logger.info(`>>> INCOMING EVENT: ${eventName}`, {
      socketId: socket.id,
      eventName,
      args,
      timestamp: new Date().toISOString(),
    });
  });

  // Log all outgoing events for debugging
  const originalEmit = socket.emit.bind(socket);
  socket.emit = function(eventName: string, ...args: any[]) {
    logger.info(`<<< OUTGOING EVENT: ${eventName}`, {
      socketId: socket.id,
      eventName,
      args,
      timestamp: new Date().toISOString(),
    });
    return originalEmit(eventName, ...args);
  } as any;
}

/**
 * Handle client disconnection
 */
export async function handleDisconnect(socket: Socket): Promise<void> {
  logger.info(`Client disconnected: ${socket.id}`);

  // Remove rate limit entry for this socket
  rateLimiter.removeSocket(socket.id);

  // Get room code and player ID from socket data
  const roomCode = socket.data.roomCode;
  const playerId = socket.data.playerId;
  const isSpectator = socket.data.isSpectator;

  if (roomCode && playerId) {
    try {
      // Handle spectators differently - remove immediately without grace period
      if (isSpectator) {
        const { RoomService } = require('../services/RoomService');
        const roomService = new RoomService();
        
        await roomService.removeSpectator(roomCode, playerId);
        
        // Notify other members
        socket.to(roomCode).emit('spectator_left', { 
          playerId, 
          roomCode,
          timestamp: Date.now()
        });

        logger.info('Spectator disconnected and removed', { playerId, roomCode });
      } else {
        // For regular players, start reconnection grace period
        await reconnectionService.handleDisconnection(socket.id, playerId, roomCode);
        
        // Notify other players about disconnection
        socket.to(roomCode).emit('player_disconnected', { 
          playerId, 
          roomCode,
          gracePeriod: 60, // seconds
          timestamp: Date.now()
        });

        logger.info('Player disconnection handled, grace period started', { playerId, roomCode });
      }
    } catch (error: any) {
      logger.error('Error handling disconnect', { 
        socketId: socket.id, 
        roomCode, 
        playerId, 
        error: error.message 
      });
    }
  }
}

/**
 * Get reconnection service instance
 */
export function getReconnectionService(): ReconnectionService {
  return reconnectionService;
}

/**
 * Set up permanent disconnection callback
 */
export function setupPermanentDisconnectCallback(callback: (playerId: string, roomCode: string) => void): void {
  reconnectionService.setPermanentDisconnectCallback(callback);
}

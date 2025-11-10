import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import { config } from './config';
import { logger, redisClient } from './utils';
import { handleConnection, handleDisconnect } from './handlers';

// Initialize Express app
const app = express();
const httpServer = createServer(app);

// Configure CORS
app.use(cors({
  origin: config.cors.allowedOrigins,
  credentials: true,
}));

// Health check endpoint
app.get('/health', async (_req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    redis: redisClient.isReady() ? 'connected' : 'disconnected',
  };
  
  logger.info('Health check', health);
  res.json(health);
});

// Initialize Socket.io with CORS configuration
const io = new Server(httpServer, {
  cors: {
    origin: config.cors.allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

// Set up permanent disconnection callback
const { setupPermanentDisconnectCallback } = require('./handlers/connectionHandlers');
setupPermanentDisconnectCallback((playerId: string, roomCode: string) => {
  io.to(roomCode).emit('player_removed', {
    playerId,
    roomCode,
    reason: 'disconnection_timeout',
    timestamp: Date.now(),
  });
  logger.info('Player permanently removed notification sent', { playerId, roomCode });
});

// Socket.io connection handler
io.on('connection', (socket: Socket) => {
  handleConnection(socket);

  // Handle disconnection
  socket.on('disconnect', async () => {
    await handleDisconnect(socket);
  });

  // Room event handlers
  const { registerRoomHandlers } = require('./handlers/roomHandlers');
  registerRoomHandlers(socket);

  // Game event handlers
  const { handleRollDice, handleMoveToken } = require('./handlers/gameHandlers');
  handleRollDice(socket);
  handleMoveToken(socket);

  // Matchmaking event handlers
  const { registerMatchmakingHandlers } = require('./handlers/matchmakingHandlers');
  registerMatchmakingHandlers(socket);

  // Reconnection handler
  socket.on('reconnect_player', async (data, callback) => {
    try {
      logger.info('reconnect_player event received', { socketId: socket.id, data });

      const { playerId, roomCode } = data;

      if (!playerId || !roomCode) {
        const error = { error: 'Player ID and room code are required' };
        logger.warn('reconnect_player failed: missing data', { socketId: socket.id });
        if (callback) callback(error);
        return;
      }

      const { ReconnectionService } = require('./services/ReconnectionService');
      const { GameService } = require('./services/GameService');
      const reconnectionService = new ReconnectionService();
      const gameService = new GameService();

      // Verify player has an active session in this room
      const hasSession = await reconnectionService.hasActiveSession(playerId, roomCode);
      
      if (!hasSession) {
        const error = { error: 'No active session found for this room' };
        logger.warn('reconnect_player failed: no active session', { playerId, roomCode });
        if (callback) callback(error);
        return;
      }

      // Cancel disconnection timer
      reconnectionService.cancelDisconnectionTimer(playerId);

      // Update socket ID for the player
      await reconnectionService.updateSocketId(playerId, socket.id);

      // Update connection status to connected
      await reconnectionService.updatePlayerConnectionStatus(roomCode, playerId, require('./models/Player').ConnectionStatus.CONNECTED);

      // Join socket to room channel
      socket.join(roomCode);

      // Store room code and player ID in socket data
      socket.data.roomCode = roomCode;
      socket.data.playerId = playerId;

      // Get current game state
      const gameState = await gameService.getGameState(roomCode);

      // Send success response with current game state
      const response = {
        success: true,
        gameState,
        message: 'Reconnected successfully',
      };

      logger.info('Player reconnected successfully', { playerId, roomCode, socketId: socket.id });

      if (callback) callback(response);

      // Notify other players about reconnection
      socket.to(roomCode).emit('player_reconnected', {
        playerId,
        roomCode,
        timestamp: Date.now(),
      });

      // Send current game state to reconnected player
      if (gameState) {
        socket.emit('game_state_update', { gameState });
      }

    } catch (error: any) {
      logger.error('reconnect_player error', { socketId: socket.id, error: error.message });
      const errorResponse = { error: error.message || 'Failed to reconnect' };
      if (callback) callback(errorResponse);
    }
  });
});

// Initialize Redis and start server
async function startServer() {
  try {
    // Initialize Firebase Admin (for authentication)
    const { initializeFirebaseAdmin } = require('./middleware/auth');
    initializeFirebaseAdmin();

    // Connect to Redis
    await redisClient.connect();
    logger.info('Redis connection established');

    // Start HTTP server
    httpServer.listen(config.port, () => {
      logger.info(`Server started on port ${config.port}`);
      logger.info(`Environment: ${config.nodeEnv}`);
      logger.info(`CORS allowed origins: ${config.cors.allowedOrigins.join(', ')}`);
    });

    // Start room cleanup scheduler (runs every 5 minutes)
    startRoomCleanupScheduler();

    // Start matchmaking scheduler (runs every 5 seconds)
    startMatchmakingScheduler();
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

/**
 * Scheduled job to clean up abandoned rooms
 * Runs every 5 minutes
 */
function startRoomCleanupScheduler() {
  const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds
  
  const { RoomService } = require('./services/RoomService');
  const roomService = new RoomService();

  setInterval(async () => {
    try {
      logger.debug('Running room cleanup job');
      const cleanedCount = await roomService.cleanupAbandonedRooms();
      if (cleanedCount > 0) {
        logger.info(`Room cleanup completed: ${cleanedCount} rooms cleaned`);
      }
    } catch (error) {
      logger.error('Room cleanup job failed', error);
    }
  }, CLEANUP_INTERVAL);

  logger.info('Room cleanup scheduler started (runs every 5 minutes)');
}

/**
 * Scheduled job to check for matchmaking matches
 * Runs every 5 seconds
 */
function startMatchmakingScheduler() {
  const { startMatchmakingScheduler } = require('./handlers/matchmakingHandlers');
  startMatchmakingScheduler(io);
}

startServer();

// Graceful shutdown
async function shutdown() {
  logger.info('Shutting down gracefully...');
  
  // Close HTTP server
  httpServer.close(() => {
    logger.info('HTTP server closed');
  });

  // Disconnect Redis
  await redisClient.disconnect();
  
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Export for testing
export { app, io, httpServer };

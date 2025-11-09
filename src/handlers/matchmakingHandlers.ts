import { Socket } from 'socket.io';
import { MatchmakingService } from '../services/MatchmakingService';
import { logger } from '../utils/logger';

const matchmakingService = new MatchmakingService();

/**
 * Register matchmaking event handlers
 */
export function registerMatchmakingHandlers(socket: Socket): void {
  socket.on('join_matchmaking', async (data, callback) => {
    await handleJoinMatchmaking(socket, data, callback);
  });

  socket.on('leave_matchmaking', async (data, callback) => {
    await handleLeaveMatchmaking(socket, data, callback);
  });
}

/**
 * Handle join matchmaking request
 */
async function handleJoinMatchmaking(
  socket: Socket,
  data: { playerId: string; playerName: string; preferredPlayers?: number },
  callback?: (response: any) => void
): Promise<void> {
  try {
    const { playerId, playerName, preferredPlayers = 4 } = data;

    logger.info('Player joining matchmaking', { socketId: socket.id, playerId, playerName, preferredPlayers });

    // Validate input
    if (!playerId || !playerName) {
      const error = { error: 'Player ID and name are required' };
      logger.warn('Invalid join matchmaking request', { socketId: socket.id, error });
      if (callback) callback(error);
      return;
    }

    // Add player to queue
    await matchmakingService.addToQueue(playerId, playerName, preferredPlayers);

    // Join matchmaking room for broadcasts
    socket.join('matchmaking');

    // Get current queue size
    const queueSize = await matchmakingService.getQueueSize();

    // Send success response
    const response = {
      success: true,
      queueSize,
      message: 'Added to matchmaking queue',
    };

    if (callback) callback(response);

    // Broadcast queue update to all players in matchmaking
    socket.to('matchmaking').emit('matchmaking_update', {
      queueSize,
      timestamp: Date.now(),
    });

    logger.info('Player added to matchmaking', { playerId, queueSize });
  } catch (error) {
    logger.error('Error handling join matchmaking', { socketId: socket.id, error });
    if (callback) {
      callback({ error: error instanceof Error ? error.message : 'Failed to join matchmaking' });
    }
  }
}

/**
 * Handle leave matchmaking request
 */
async function handleLeaveMatchmaking(
  socket: Socket,
  data: { playerId: string },
  callback?: (response: any) => void
): Promise<void> {
  try {
    const { playerId } = data;

    logger.info('Player leaving matchmaking', { socketId: socket.id, playerId });

    // Validate input
    if (!playerId) {
      const error = { error: 'Player ID is required' };
      logger.warn('Invalid leave matchmaking request', { socketId: socket.id, error });
      if (callback) callback(error);
      return;
    }

    // Remove player from queue
    await matchmakingService.removeFromQueue(playerId);

    // Leave matchmaking room
    socket.leave('matchmaking');

    // Get current queue size
    const queueSize = await matchmakingService.getQueueSize();

    // Send success response
    const response = {
      success: true,
      message: 'Removed from matchmaking queue',
    };

    if (callback) callback(response);

    // Broadcast queue update to all players in matchmaking
    socket.to('matchmaking').emit('matchmaking_update', {
      queueSize,
      timestamp: Date.now(),
    });

    logger.info('Player removed from matchmaking', { playerId, queueSize });
  } catch (error) {
    logger.error('Error handling leave matchmaking', { socketId: socket.id, error });
    if (callback) {
      callback({ error: error instanceof Error ? error.message : 'Failed to leave matchmaking' });
    }
  }
}

/**
 * Start periodic matchmaking check
 * Runs every 5 seconds to find matches
 */
export function startMatchmakingScheduler(io: any): void {
  const MATCHMAKING_INTERVAL = 5000; // 5 seconds

  setInterval(async () => {
    try {
      const queueSize = await matchmakingService.getQueueSize();
      
      if (queueSize < 2) {
        return; // Not enough players to match
      }

      logger.debug('Running matchmaking check', { queueSize });

      // Try to find a match
      const matchedPlayers = await matchmakingService.findMatch();

      if (matchedPlayers) {
        logger.info('Match found', { playerCount: matchedPlayers.length, playerIds: matchedPlayers.map(p => p.playerId) });

        // Create room for matched players
        const roomCode = await matchmakingService.createMatchedRoom(matchedPlayers);

        // Notify all matched players
        io.to('matchmaking').emit('match_found', {
          roomCode,
          players: matchedPlayers.map(p => ({
            playerId: p.playerId,
            playerName: p.playerName,
          })),
          timestamp: Date.now(),
        });

        // Update queue size for remaining players
        const newQueueSize = await matchmakingService.getQueueSize();
        io.to('matchmaking').emit('matchmaking_update', {
          queueSize: newQueueSize,
          timestamp: Date.now(),
        });

        logger.info('Match created and players notified', { roomCode, playerCount: matchedPlayers.length });
      }
    } catch (error) {
      logger.error('Error in matchmaking scheduler', error);
    }
  }, MATCHMAKING_INTERVAL);

  logger.info('Matchmaking scheduler started (runs every 5 seconds)');
}

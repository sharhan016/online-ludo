import { Socket } from 'socket.io';
import { GameService } from '../services/GameService';
import { RoomService } from '../services/RoomService';
import { logger } from '../utils/logger';

const gameService = new GameService();
const roomService = new RoomService();

/**
 * Check if player is a spectator
 */
async function isSpectator(roomCode: string, playerId: string): Promise<boolean> {
  const room = await roomService.getRoomData(roomCode);
  if (!room || !room.spectators) {
    return false;
  }
  return room.spectators.includes(playerId);
}

/**
 * Handle dice roll event
 */
export function handleRollDice(socket: Socket): void {
  socket.on('roll_dice', async (data: { roomCode: string; playerId: string }) => {
    try {
      const { roomCode, playerId } = data;

      logger.info(`Player ${playerId} rolling dice in room ${roomCode}`);

      // Validate input
      if (!roomCode || !playerId) {
        socket.emit('error', { message: 'Missing required fields' });
        return;
      }

      // Check if player is a spectator
      if (await isSpectator(roomCode, playerId)) {
        socket.emit('error', { message: 'Spectators cannot perform game actions' });
        logger.warn('Spectator attempted to roll dice', { roomCode, playerId });
        return;
      }

      // Roll dice
      const result = await gameService.rollDice(roomCode, playerId);

      if (!result.success) {
        socket.emit('error', { message: result.error });
        return;
      }

      // Get updated game state
      const gameState = await gameService.getGameState(roomCode);

      if (!gameState) {
        socket.emit('error', { message: 'Game state not found' });
        return;
      }

      // Broadcast dice rolled event to all players in the room
      socket.to(roomCode).emit('dice_rolled', {
        playerId,
        diceValue: result.diceValue,
        skipTurn: result.skipTurn,
        timestamp: Date.now(),
      });

      // Send to the player who rolled
      socket.emit('dice_rolled', {
        playerId,
        diceValue: result.diceValue,
        skipTurn: result.skipTurn,
        timestamp: Date.now(),
      });

      // Always broadcast updated game state after dice roll
      socket.to(roomCode).emit('game_state_update', {
        ...gameState,
        timestamp: Date.now(),
      });

      socket.emit('game_state_update', {
        ...gameState,
        timestamp: Date.now(),
      });

      if (result.skipTurn) {
        logger.info(
          `Turn skipped for player ${playerId} in room ${roomCode} (no valid moves or three 6s)`
        );
      }

      logger.info(`Dice rolled: ${result.diceValue} for player ${playerId} in room ${roomCode}`);
    } catch (error) {
      logger.error('Error handling roll_dice:', error);
      socket.emit('error', { message: 'Failed to roll dice' });
    }
  });
}

/**
 * Handle move token event
 */
export function handleMoveToken(socket: Socket): void {
  socket.on(
    'move_token',
    async (data: {
      roomCode: string;
      playerId: string;
      tokenId: string;
      targetPositionId: string;
    }) => {
      try {
        const { roomCode, playerId, tokenId, targetPositionId } = data;

        logger.info(
          `Player ${playerId} moving token ${tokenId} to ${targetPositionId} in room ${roomCode}`
        );

        // Validate input
        if (!roomCode || !playerId || !tokenId || !targetPositionId) {
          socket.emit('error', { message: 'Missing required fields' });
          return;
        }

        // Check if player is a spectator
        if (await isSpectator(roomCode, playerId)) {
          socket.emit('error', { message: 'Spectators cannot perform game actions' });
          logger.warn('Spectator attempted to move token', { roomCode, playerId });
          return;
        }

        // Move token
        const result = await gameService.moveToken(roomCode, playerId, tokenId, targetPositionId);

        if (!result.success) {
          socket.emit('error', { message: result.error });
          return;
        }

        // Get updated game state
        const gameState = await gameService.getGameState(roomCode);

        if (!gameState) {
          socket.emit('error', { message: 'Game state not found' });
          return;
        }

        // Broadcast token moved event to all players in the room
        socket.to(roomCode).emit('token_moved', {
          playerId,
          tokenId,
          fromPosition: result.result!.fromPosition,
          toPosition: result.result!.toPosition,
          capturedTokenId: result.result!.capturedTokenId,
          timestamp: Date.now(),
        });

        // Send to the player who moved
        socket.emit('token_moved', {
          playerId,
          tokenId,
          fromPosition: result.result!.fromPosition,
          toPosition: result.result!.toPosition,
          capturedTokenId: result.result!.capturedTokenId,
          timestamp: Date.now(),
        });

        // Broadcast updated game state
        socket.to(roomCode).emit('game_state_update', {
          ...gameState,
          timestamp: Date.now(),
        });

        socket.emit('game_state_update', {
          ...gameState,
          timestamp: Date.now(),
        });

        // Handle turn switching
        if (!result.result!.extraTurn && gameState.phase !== 'finished') {
          // Switch to next player
          const updatedGameState = await gameService.switchTurn(roomCode);

          if (updatedGameState) {
            // Broadcast turn change
            socket.to(roomCode).emit('game_state_update', {
              ...updatedGameState,
              timestamp: Date.now(),
            });

            socket.emit('game_state_update', {
              ...updatedGameState,
              timestamp: Date.now(),
            });

            logger.info(
              `Turn switched to player ${updatedGameState.players[updatedGameState.currentPlayerIndex].playerId} in room ${roomCode}`
            );
          }
        }

        logger.info(
          `Token moved: ${tokenId} from ${result.result!.fromPosition} to ${result.result!.toPosition} in room ${roomCode}`
        );
      } catch (error) {
        logger.error('Error handling move_token:', error);
        socket.emit('error', { message: 'Failed to move token' });
      }
    }
  );
}

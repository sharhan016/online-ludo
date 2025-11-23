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
    const startTime = Date.now();
    logger.info('>>> INCOMING: roll_dice', { 
      socketId: socket.id, 
      data,
      timestamp: new Date().toISOString()
    });

    try {
      const { roomCode, playerId } = data;

      // Validate input
      if (!roomCode || !playerId) {
        const error = { message: 'Missing required fields' };
        logger.warn('<<< RESPONSE: roll_dice FAILED - missing fields', { 
          socketId: socket.id,
          error,
          duration: Date.now() - startTime
        });
        socket.emit('error', error);
        return;
      }

      // Check if player is a spectator
      if (await isSpectator(roomCode, playerId)) {
        const error = { message: 'Spectators cannot perform game actions' };
        logger.warn('<<< RESPONSE: roll_dice FAILED - spectator', { 
          socketId: socket.id,
          roomCode,
          playerId,
          error,
          duration: Date.now() - startTime
        });
        socket.emit('error', error);
        return;
      }

      // Roll dice
      logger.info('roll_dice: Calling game service', { roomCode, playerId });
      const result = await gameService.rollDice(roomCode, playerId);

      if (!result.success) {
        const error = { message: result.error };
        logger.warn('<<< RESPONSE: roll_dice FAILED', { 
          socketId: socket.id,
          roomCode,
          playerId,
          error,
          duration: Date.now() - startTime
        });
        socket.emit('error', error);
        return;
      }

      logger.info('roll_dice: Dice rolled successfully', { 
        roomCode,
        playerId,
        diceValue: result.diceValue,
        skipTurn: result.skipTurn
      });

      // Get updated game state
      const gameState = await gameService.getGameState(roomCode);

      if (!gameState) {
        const error = { message: 'Game state not found' };
        logger.error('<<< RESPONSE: roll_dice ERROR - game state not found', { 
          socketId: socket.id,
          roomCode,
          error,
          duration: Date.now() - startTime
        });
        socket.emit('error', error);
        return;
      }

      const diceRolledData = {
        playerId,
        diceValue: result.diceValue,
        skipTurn: result.skipTurn,
        timestamp: Date.now(),
      };

      // Broadcast dice rolled event to all players in the room
      logger.info('>>> EMIT: dice_rolled', { roomCode, data: diceRolledData });
      socket.to(roomCode).emit('dice_rolled', diceRolledData);
      socket.emit('dice_rolled', diceRolledData);

      // Always broadcast updated game state after dice roll
      const gameStateUpdate = {
        ...gameState,
        currentPlayerId: gameState.players[gameState.currentPlayerIndex].playerId,
        currentPlayerName: gameState.players[gameState.currentPlayerIndex].playerName,
        gameStatus: gameState.phase === 'finished' ? 'finished' : 'playing',
        timestamp: Date.now(),
      };

      logger.info('>>> EMIT: game_state_update (after dice)', { 
        roomCode,
        phase: gameState.phase,
        diceValue: gameState.diceValue,
        currentPlayer: gameStateUpdate.currentPlayerName
      });
      socket.to(roomCode).emit('game_state_update', gameStateUpdate);
      socket.emit('game_state_update', gameStateUpdate);

      if (result.skipTurn) {
        logger.info('roll_dice: Turn skipped (no valid moves or three 6s)', { 
          roomCode,
          playerId,
          diceValue: result.diceValue
        });
      }

      logger.info('<<< RESPONSE: roll_dice SUCCESS', { 
        socketId: socket.id,
        roomCode,
        playerId,
        diceValue: result.diceValue,
        duration: Date.now() - startTime
      });
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
      const startTime = Date.now();
      logger.info('>>> INCOMING: move_token', { 
        socketId: socket.id, 
        data,
        timestamp: new Date().toISOString()
      });

      try {
        const { roomCode, playerId, tokenId, targetPositionId } = data;

        // Validate input
        if (!roomCode || !playerId || !tokenId || !targetPositionId) {
          const error = { message: 'Missing required fields' };
          logger.warn('<<< RESPONSE: move_token FAILED - missing fields', { 
            socketId: socket.id,
            error,
            duration: Date.now() - startTime
          });
          socket.emit('error', error);
          return;
        }

        // Check if player is a spectator
        if (await isSpectator(roomCode, playerId)) {
          const error = { message: 'Spectators cannot perform game actions' };
          logger.warn('<<< RESPONSE: move_token FAILED - spectator', { 
            socketId: socket.id,
            roomCode,
            playerId,
            error,
            duration: Date.now() - startTime
          });
          socket.emit('error', error);
          return;
        }

        // Move token
        logger.info('move_token: Calling game service', { roomCode, playerId, tokenId, targetPositionId });
        const result = await gameService.moveToken(roomCode, playerId, tokenId, targetPositionId);

        if (!result.success) {
          const error = { message: result.error };
          logger.warn('<<< RESPONSE: move_token FAILED', { 
            socketId: socket.id,
            roomCode,
            playerId,
            tokenId,
            error,
            duration: Date.now() - startTime
          });
          socket.emit('error', error);
          return;
        }

        logger.info('move_token: Token moved successfully', { 
          roomCode,
          playerId,
          tokenId,
          from: result.result!.fromPosition,
          to: result.result!.toPosition,
          captured: result.result!.capturedTokenId,
          extraTurn: result.result!.extraTurn
        });

        // Get updated game state
        const gameState = await gameService.getGameState(roomCode);

        if (!gameState) {
          const error = { message: 'Game state not found' };
          logger.error('<<< RESPONSE: move_token ERROR - game state not found', { 
            socketId: socket.id,
            roomCode,
            error,
            duration: Date.now() - startTime
          });
          socket.emit('error', error);
          return;
        }

        const tokenMovedData = {
          playerId,
          tokenId,
          fromPosition: result.result!.fromPosition,
          toPosition: result.result!.toPosition,
          capturedTokenId: result.result!.capturedTokenId,
          timestamp: Date.now(),
        };

        // Broadcast token moved event to all players in the room
        logger.info('>>> EMIT: token_moved', { roomCode, data: tokenMovedData });
        socket.to(roomCode).emit('token_moved', tokenMovedData);
        socket.emit('token_moved', tokenMovedData);

        // Broadcast updated game state
        const gameStateUpdate = {
          ...gameState,
          currentPlayerId: gameState.players[gameState.currentPlayerIndex].playerId,
          currentPlayerName: gameState.players[gameState.currentPlayerIndex].playerName,
          gameStatus: gameState.phase === 'finished' ? 'finished' : 'playing',
          timestamp: Date.now(),
        };

        logger.info('>>> EMIT: game_state_update (after move)', { 
          roomCode,
          phase: gameState.phase,
          currentPlayer: gameStateUpdate.currentPlayerName,
          extraTurn: result.result!.extraTurn
        });
        socket.to(roomCode).emit('game_state_update', gameStateUpdate);
        socket.emit('game_state_update', gameStateUpdate);

        // Handle turn switching
        if (!result.result!.extraTurn && gameState.phase !== 'finished') {
          // Switch to next player
          logger.info('move_token: Switching turn', { roomCode, currentPlayer: playerId });
          const updatedGameState = await gameService.switchTurn(roomCode);

          if (updatedGameState) {
            const nextPlayer = updatedGameState.players[updatedGameState.currentPlayerIndex];
            logger.info('move_token: Turn switched', { 
              roomCode,
              nextPlayerId: nextPlayer.playerId,
              nextPlayerName: nextPlayer.playerName
            });

            // Broadcast turn change
            const turnChangeUpdate = {
              ...updatedGameState,
              currentPlayerId: nextPlayer.playerId,
              currentPlayerName: nextPlayer.playerName,
              gameStatus: updatedGameState.phase === 'finished' ? 'finished' : 'playing',
              timestamp: Date.now(),
            };

            logger.info('>>> EMIT: game_state_update (turn switch)', { 
              roomCode,
              currentPlayer: nextPlayer.playerName
            });
            socket.to(roomCode).emit('game_state_update', turnChangeUpdate);
            socket.emit('game_state_update', turnChangeUpdate);
          }
        }

        logger.info('<<< RESPONSE: move_token SUCCESS', { 
          socketId: socket.id,
          roomCode,
          playerId,
          tokenId,
          duration: Date.now() - startTime
        });
      } catch (error) {
        logger.error('Error handling move_token:', error);
        socket.emit('error', { message: 'Failed to move token' });
      }
    }
  );
}

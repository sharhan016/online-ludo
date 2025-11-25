import { GameState, GamePhase, TokenPosition } from '../models/GameState';
import { Player, PlayerColor } from '../models/Player';
import { MoveResult } from '../models/Token';
import { redisClient } from '../utils/redis';
import {
  canMoveToken,
  detectCollision,
  checkWinCondition,
  getBasePosition,
  isValidTokenId,
  BASE_POSITIONS,
} from '../utils/gameRules';
import { logger } from '../utils';

/**
 * Game logic service
 * Handles game state, dice rolling, token movement, and game rules
 */
export class GameService {
  private static readonly GAME_STATE_PREFIX = 'game:';
  private static readonly GAME_STATE_TTL = 7200; // 2 hours

  /**
   * Initialize a new game state
   */
  async initializeGame(roomCode: string, players: Player[]): Promise<GameState> {
    // Initialize token positions for all players
    const tokenPositions: Record<string, TokenPosition[]> = {};

    for (const player of players) {
      const basePositions = BASE_POSITIONS[player.color];
      tokenPositions[player.color] = basePositions.map((positionId, index) => ({
        tokenId: `${player.color.charAt(0).toUpperCase()}T${index + 1}`,
        positionId,
      }));
    }

    const gameState: GameState = {
      roomCode,
      players,
      currentPlayerIndex: 0,
      diceValue: null,
      tokenPositions,
      phase: GamePhase.ROLLING,
      rankings: [],
      consecutiveSixes: 0,
      startedAt: new Date(),
    };

    // Store in Redis
    await this.saveGameState(gameState);

    return gameState;
  }

  /**
   * Get game state from Redis
   */
  async getGameState(roomCode: string): Promise<GameState | null> {
    const key = `${GameService.GAME_STATE_PREFIX}${roomCode}`;
    const data = await redisClient.get(key);

    if (!data) {
      return null;
    }

    return JSON.parse(data) as GameState;
  }

  /**
   * Save game state to Redis
   */
  async saveGameState(gameState: GameState): Promise<void> {
    const key = `${GameService.GAME_STATE_PREFIX}${gameState.roomCode}`;
    await redisClient.set(key, JSON.stringify(gameState), GameService.GAME_STATE_TTL);
  }

  /**
   * Update game state after a validated move
   */
  async updateGameState(
    roomCode: string,
    updates: Partial<GameState>
  ): Promise<GameState | null> {
    const gameState = await this.getGameState(roomCode);

    if (!gameState) {
      return null;
    }

    // Apply updates
    Object.assign(gameState, updates);

    // Save updated state
    await this.saveGameState(gameState);

    return gameState;
  }

  /**
   * Roll dice for a player
   */
  async rollDice(
    roomCode: string,
    playerId: string
  ): Promise<{ success: boolean; diceValue?: number; error?: string; skipTurn?: boolean }> {
    const gameState = await this.getGameState(roomCode);

    if (!gameState) {
      return { success: false, error: 'Game not found' };
    }

    // Validate it's the player's turn
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (currentPlayer.playerId !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    // Validate game phase
    if (gameState.phase !== GamePhase.ROLLING) {
      return { success: false, error: 'Cannot roll dice in current phase' };
    }

    // Generate random dice value (1-6)
    const diceValue = Math.floor(Math.random() * 6) + 1;

    // Track consecutive sixes
    if (diceValue === 6) {
      gameState.consecutiveSixes++;
    } else {
      gameState.consecutiveSixes = 0;
    }

    // Check for three consecutive sixes - skip turn
    if (gameState.consecutiveSixes === 3) {
      gameState.consecutiveSixes = 0;
      gameState.diceValue = null;
      gameState.phase = GamePhase.ROLLING;

      // Switch to next player
      await this.switchTurn(roomCode);

      return { success: true, diceValue, skipTurn: true };
    }

    // Check if player has any valid moves
    const hasValidMoves = this.checkValidMoves(gameState, currentPlayer.color, diceValue);

    if (!hasValidMoves) {
      // No valid moves, skip turn automatically
      gameState.diceValue = null;
      gameState.phase = GamePhase.ROLLING;
      await this.switchTurn(roomCode);
      
      return { success: true, diceValue, skipTurn: true };
    }

    // Update game state
    gameState.diceValue = diceValue;
    gameState.phase = GamePhase.MOVING;

    await this.saveGameState(gameState);

    return { success: true, diceValue, skipTurn: false };
  }

  /**
   * Check if player has any valid moves with current dice value
   */
  private checkValidMoves(
    gameState: GameState,
    color: PlayerColor,
    diceValue: number
  ): boolean {
    const playerTokens = gameState.tokenPositions[color];

    for (const token of playerTokens) {
      const moveValidation = canMoveToken(token.positionId, diceValue, color);
      if (moveValidation.valid) {
        return true;
      }
    }

    return false;
  }

  /**
   * Move a token
   */
  async moveToken(
    roomCode: string,
    playerId: string,
    tokenId: string,
    targetPositionId: string
  ): Promise<{ success: boolean; result?: MoveResult; error?: string }> {
    const gameState = await this.getGameState(roomCode);

    if (!gameState) {
      return { success: false, error: 'Game not found' };
    }

    // Validate it's the player's turn
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (currentPlayer.playerId !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    // Validate game phase
    if (gameState.phase !== GamePhase.MOVING) {
      return { success: false, error: 'Cannot move token in current phase' };
    }

    // Validate dice was rolled
    if (gameState.diceValue === null) {
      return { success: false, error: 'Dice not rolled' };
    }

    // Validate token belongs to player
    logger.info(`[MOVE_TOKEN] Validating token: tokenId=${tokenId}, playerColor=${currentPlayer.color}`);
    const isValid = isValidTokenId(tokenId, currentPlayer.color);
    logger.info(`[MOVE_TOKEN] Token validation result: ${isValid}`);
    
    if (!isValid) {
      logger.warn(`[MOVE_TOKEN] Invalid token: ${tokenId} for color ${currentPlayer.color}`);
      return { success: false, error: 'Invalid token' };
    }

    // Get current token position
    const playerTokens = gameState.tokenPositions[currentPlayer.color];
    const token = playerTokens.find((t) => t.tokenId === tokenId);

    if (!token) {
      return { success: false, error: 'Token not found' };
    }

    // Validate move
    const moveValidation = canMoveToken(
      token.positionId,
      gameState.diceValue,
      currentPlayer.color
    );

    if (!moveValidation.valid) {
      return { success: false, error: moveValidation.reason };
    }

    // Validate target position matches calculated position
    if (moveValidation.targetPosition !== targetPositionId) {
      return { success: false, error: 'Invalid target position' };
    }

    const fromPosition = token.positionId;

    // Update token position
    token.positionId = targetPositionId;

    // Check for collisions
    const collision = detectCollision(
      targetPositionId,
      currentPlayer.color,
      gameState.tokenPositions
    );

    let capturedTokenId: string | undefined;

    // Handle captured tokens
    if (collision.captured) {
      for (const capturedToken of collision.capturedTokens) {
        // Find the captured token's color
        for (const [colorKey, tokens] of Object.entries(gameState.tokenPositions)) {
          const color = colorKey as PlayerColor;
          const tokenIndex = tokens.findIndex((t) => t.tokenId === capturedToken.tokenId);

          if (tokenIndex !== -1) {
            // Move captured token back to base
            const basePosition = getBasePosition(capturedToken.tokenId, color);
            tokens[tokenIndex].positionId = basePosition;
            capturedTokenId = capturedToken.tokenId;
            break;
          }
        }
      }
    }

    // Check win condition
    const hasWon = checkWinCondition(currentPlayer.color, playerTokens);

    if (hasWon) {
      // Add to rankings
      const rank = gameState.rankings.length + 1;
      gameState.rankings.push({
        playerId: currentPlayer.playerId,
        rank,
        finishedAt: new Date(),
      });

      // Update player rank
      currentPlayer.rank = rank;

      // Check if game is finished (all but one player has finished)
      if (gameState.rankings.length === gameState.players.length - 1) {
        // Find the last player and assign them the last rank
        const lastPlayer = gameState.players.find(
          (p) => !gameState.rankings.some((r) => r.playerId === p.playerId)
        );

        if (lastPlayer) {
          gameState.rankings.push({
            playerId: lastPlayer.playerId,
            rank: gameState.players.length,
            finishedAt: new Date(),
          });
          lastPlayer.rank = gameState.players.length;
        }

        gameState.phase = GamePhase.FINISHED;
        gameState.finishedAt = new Date();
      }
    }

    // Determine if player gets extra turn
    // Extra turn is granted if:
    // 1. Dice value was 6
    // 2. Token captured an opponent
    const extraTurn = gameState.diceValue === 6 || collision.captured;

    // Update game phase based on extra turn
    if (extraTurn) {
      // Player gets another turn - reset to rolling phase
      gameState.phase = GamePhase.ROLLING;
      gameState.diceValue = null;
      // Don't reset consecutiveSixes here - it's tracked across rolls
    } else {
      // No extra turn - prepare for turn switch
      gameState.phase = GamePhase.ROLLING;
      gameState.diceValue = null;
      // consecutiveSixes will be reset when turn switches
    }

    // Save game state
    await this.saveGameState(gameState);

    const result: MoveResult = {
      success: true,
      tokenId,
      fromPosition,
      toPosition: targetPositionId,
      capturedTokenId,
      extraTurn,
    };

    return { success: true, result };
  }

  /**
   * Switch to next player's turn
   */
  async switchTurn(roomCode: string): Promise<GameState | null> {
    const gameState = await this.getGameState(roomCode);

    if (!gameState) {
      return null;
    }

    // Find next player who hasn't won
    let nextPlayerIndex = gameState.currentPlayerIndex;
    do {
      nextPlayerIndex = (nextPlayerIndex + 1) % gameState.players.length;
    } while (
      gameState.players[nextPlayerIndex].rank > 0 &&
      nextPlayerIndex !== gameState.currentPlayerIndex
    );

    gameState.currentPlayerIndex = nextPlayerIndex;
    gameState.diceValue = null;
    gameState.phase = GamePhase.ROLLING;
    gameState.consecutiveSixes = 0; // Reset consecutive sixes for new player

    await this.saveGameState(gameState);

    return gameState;
  }

  /**
   * Delete game state
   */
  async deleteGameState(roomCode: string): Promise<void> {
    const key = `${GameService.GAME_STATE_PREFIX}${roomCode}`;
    await redisClient.delete(key);
  }
}

import { Socket } from 'socket.io';
import { logger } from '../utils/logger';
import {
  isValidRoomCode,
  isValidPlayerId,
  isValidPlayerName,
  isValidTokenId,
  isValidPositionId,
  sanitizeString,
  sanitizeRoomCode,
  sanitizePlayerName,
  validateEventData,
} from '../utils/validation';

/**
 * Validation middleware for socket events
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
  sanitizedData?: any;
}

/**
 * Validate create room data
 */
export function validateCreateRoomData(data: any): ValidationResult {
  const validation = validateEventData(data, ['playerId', 'playerName']);
  if (!validation.valid) {
    return validation;
  }

  const { playerId, playerName, maxPlayers } = data;

  if (!isValidPlayerId(playerId)) {
    return { valid: false, error: 'Invalid player ID format' };
  }

  if (!isValidPlayerName(playerName)) {
    return { valid: false, error: 'Invalid player name (must be 1-50 characters)' };
  }

  if (maxPlayers !== undefined && (typeof maxPlayers !== 'number' || maxPlayers < 2 || maxPlayers > 4)) {
    return { valid: false, error: 'Max players must be between 2 and 4' };
  }

  return {
    valid: true,
    sanitizedData: {
      playerId: sanitizeString(playerId),
      playerName: sanitizePlayerName(playerName),
      maxPlayers: maxPlayers || 4,
    },
  };
}

/**
 * Validate join room data
 */
export function validateJoinRoomData(data: any): ValidationResult {
  const validation = validateEventData(data, ['roomCode', 'playerId', 'playerName']);
  if (!validation.valid) {
    return validation;
  }

  const { roomCode, playerId, playerName } = data;

  const sanitizedRoomCode = sanitizeRoomCode(roomCode);
  if (!isValidRoomCode(sanitizedRoomCode)) {
    return { valid: false, error: 'Invalid room code format (must be 6-8 alphanumeric characters)' };
  }

  if (!isValidPlayerId(playerId)) {
    return { valid: false, error: 'Invalid player ID format' };
  }

  if (!isValidPlayerName(playerName)) {
    return { valid: false, error: 'Invalid player name (must be 1-50 characters)' };
  }

  return {
    valid: true,
    sanitizedData: {
      roomCode: sanitizedRoomCode,
      playerId: sanitizeString(playerId),
      playerName: sanitizePlayerName(playerName),
    },
  };
}

/**
 * Validate leave room data
 */
export function validateLeaveRoomData(data: any): ValidationResult {
  const validation = validateEventData(data, ['roomCode', 'playerId']);
  if (!validation.valid) {
    return validation;
  }

  const { roomCode, playerId } = data;

  const sanitizedRoomCode = sanitizeRoomCode(roomCode);
  if (!isValidRoomCode(sanitizedRoomCode)) {
    return { valid: false, error: 'Invalid room code format' };
  }

  if (!isValidPlayerId(playerId)) {
    return { valid: false, error: 'Invalid player ID format' };
  }

  return {
    valid: true,
    sanitizedData: {
      roomCode: sanitizedRoomCode,
      playerId: sanitizeString(playerId),
    },
  };
}

/**
 * Validate start game data
 */
export function validateStartGameData(data: any): ValidationResult {
  const validation = validateEventData(data, ['roomCode', 'playerId']);
  if (!validation.valid) {
    return validation;
  }

  const { roomCode, playerId } = data;

  const sanitizedRoomCode = sanitizeRoomCode(roomCode);
  if (!isValidRoomCode(sanitizedRoomCode)) {
    return { valid: false, error: 'Invalid room code format' };
  }

  if (!isValidPlayerId(playerId)) {
    return { valid: false, error: 'Invalid player ID format' };
  }

  return {
    valid: true,
    sanitizedData: {
      roomCode: sanitizedRoomCode,
      playerId: sanitizeString(playerId),
    },
  };
}

/**
 * Validate roll dice data
 */
export function validateRollDiceData(data: any): ValidationResult {
  const validation = validateEventData(data, ['roomCode', 'playerId']);
  if (!validation.valid) {
    return validation;
  }

  const { roomCode, playerId } = data;

  const sanitizedRoomCode = sanitizeRoomCode(roomCode);
  if (!isValidRoomCode(sanitizedRoomCode)) {
    return { valid: false, error: 'Invalid room code format' };
  }

  if (!isValidPlayerId(playerId)) {
    return { valid: false, error: 'Invalid player ID format' };
  }

  return {
    valid: true,
    sanitizedData: {
      roomCode: sanitizedRoomCode,
      playerId: sanitizeString(playerId),
    },
  };
}

/**
 * Validate move token data
 */
export function validateMoveTokenData(data: any): ValidationResult {
  const validation = validateEventData(data, ['roomCode', 'playerId', 'tokenId', 'targetPositionId']);
  if (!validation.valid) {
    return validation;
  }

  const { roomCode, playerId, tokenId, targetPositionId } = data;

  const sanitizedRoomCode = sanitizeRoomCode(roomCode);
  if (!isValidRoomCode(sanitizedRoomCode)) {
    return { valid: false, error: 'Invalid room code format' };
  }

  if (!isValidPlayerId(playerId)) {
    return { valid: false, error: 'Invalid player ID format' };
  }

  if (!isValidTokenId(tokenId)) {
    return { valid: false, error: 'Invalid token ID format' };
  }

  if (!isValidPositionId(targetPositionId)) {
    return { valid: false, error: 'Invalid position ID format' };
  }

  return {
    valid: true,
    sanitizedData: {
      roomCode: sanitizedRoomCode,
      playerId: sanitizeString(playerId),
      tokenId: sanitizeString(tokenId),
      targetPositionId: sanitizeString(targetPositionId),
    },
  };
}

/**
 * Validate matchmaking data
 */
export function validateMatchmakingData(data: any): ValidationResult {
  const validation = validateEventData(data, ['playerId', 'playerName']);
  if (!validation.valid) {
    return validation;
  }

  const { playerId, playerName, preferredPlayers } = data;

  if (!isValidPlayerId(playerId)) {
    return { valid: false, error: 'Invalid player ID format' };
  }

  if (!isValidPlayerName(playerName)) {
    return { valid: false, error: 'Invalid player name (must be 1-50 characters)' };
  }

  const preferred = preferredPlayers || 4;
  if (![2, 3, 4].includes(preferred)) {
    return { valid: false, error: 'Preferred players must be 2, 3, or 4' };
  }

  return {
    valid: true,
    sanitizedData: {
      playerId: sanitizeString(playerId),
      playerName: sanitizePlayerName(playerName),
      preferredPlayers: preferred,
    },
  };
}

/**
 * Validate spectate game data
 */
export function validateSpectateGameData(data: any): ValidationResult {
  const validation = validateEventData(data, ['roomCode', 'playerId', 'playerName']);
  if (!validation.valid) {
    return validation;
  }

  const { roomCode, playerId, playerName } = data;

  const sanitizedRoomCode = sanitizeRoomCode(roomCode);
  if (!isValidRoomCode(sanitizedRoomCode)) {
    return { valid: false, error: 'Invalid room code format' };
  }

  if (!isValidPlayerId(playerId)) {
    return { valid: false, error: 'Invalid player ID format' };
  }

  if (!isValidPlayerName(playerName)) {
    return { valid: false, error: 'Invalid player name (must be 1-50 characters)' };
  }

  return {
    valid: true,
    sanitizedData: {
      roomCode: sanitizedRoomCode,
      playerId: sanitizeString(playerId),
      playerName: sanitizePlayerName(playerName),
    },
  };
}

/**
 * Log validation failure
 */
export function logValidationFailure(socket: Socket, event: string, error: string, data: any): void {
  logger.warn('Validation failed', {
    socketId: socket.id,
    event,
    error,
    data: JSON.stringify(data).substring(0, 200), // Limit log size
  });
}

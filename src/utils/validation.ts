/**
 * Validates a room code format
 * Room codes should be 6-8 alphanumeric characters
 */
export function isValidRoomCode(roomCode: string): boolean {
  if (!roomCode || typeof roomCode !== 'string') {
    return false;
  }
  return /^[A-Z0-9]{6,8}$/.test(roomCode);
}

/**
 * Validates a player ID
 * Player IDs should not be empty
 */
export function isValidPlayerId(playerId: string): boolean {
  return !!playerId && typeof playerId === 'string' && playerId.trim().length > 0;
}

/**
 * Validates a player name
 * Player names should be 1-50 characters
 */
export function isValidPlayerName(playerName: string): boolean {
  if (!playerName || typeof playerName !== 'string') {
    return false;
  }
  const trimmed = playerName.trim();
  return trimmed.length >= 1 && trimmed.length <= 50;
}

/**
 * Generates a random room code
 */
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Validates token ID format
 */
export function isValidTokenId(tokenId: string): boolean {
  return !!tokenId && typeof tokenId === 'string' && tokenId.trim().length > 0;
}

/**
 * Validates position ID format
 */
export function isValidPositionId(positionId: string): boolean {
  return !!positionId && typeof positionId === 'string' && positionId.trim().length > 0;
}

/**
 * Sanitizes a string by removing potentially harmful characters
 */
export function sanitizeString(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }
  // Remove HTML tags and special characters that could be used for injection
  return input
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/[<>'"]/g, '') // Remove quotes and angle brackets
    .trim();
}

/**
 * Sanitizes a room code to ensure it only contains valid characters
 */
export function sanitizeRoomCode(roomCode: string): string {
  if (!roomCode || typeof roomCode !== 'string') {
    return '';
  }
  // Only allow uppercase letters and numbers
  return roomCode.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 8);
}

/**
 * Validates max players value
 */
export function isValidMaxPlayers(maxPlayers: number): boolean {
  return typeof maxPlayers === 'number' && maxPlayers >= 2 && maxPlayers <= 4;
}

/**
 * Validates dice value
 */
export function isValidDiceValue(diceValue: number): boolean {
  return typeof diceValue === 'number' && diceValue >= 1 && diceValue <= 6;
}

/**
 * Validates preferred players for matchmaking
 */
export function isValidPreferredPlayers(preferredPlayers: number): boolean {
  return typeof preferredPlayers === 'number' && [2, 3, 4].includes(preferredPlayers);
}

/**
 * Validates event data schema
 */
export function validateEventData(data: any, requiredFields: string[]): { valid: boolean; error?: string } {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid data format' };
  }

  for (const field of requiredFields) {
    if (!(field in data) || data[field] === null || data[field] === undefined) {
      return { valid: false, error: `Missing required field: ${field}` };
    }
  }

  return { valid: true };
}

/**
 * Sanitizes player name
 */
export function sanitizePlayerName(playerName: string): string {
  if (!playerName || typeof playerName !== 'string') {
    return '';
  }
  // Remove harmful characters but allow spaces and common punctuation
  const sanitized = playerName
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/[<>'"]/g, '') // Remove quotes and angle brackets
    .trim();
  
  // Limit length
  return sanitized.substring(0, 50);
}

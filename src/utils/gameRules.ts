import { PlayerColor } from '../models/Player';
import { TokenPosition } from '../models/GameState';

/**
 * Ludo game rules and validation logic
 * Ported from the Dart client implementation
 */

// Token path definitions for each color
export const TOKEN_PATHS: Record<PlayerColor, string[]> = {
  [PlayerColor.BLUE]: [
    'B04', 'B03', 'B02', 'B01', 'B00', 'R52', 'R42', 'R32', 'R22', 'R12',
    'R02', 'R01', 'R00', 'R10', 'R20', 'R30', 'R40', 'R50', 'G05', 'G04',
    'G03', 'G02', 'G01', 'G00', 'G10', 'G20', 'G21', 'G22', 'G23', 'G24',
    'G25', 'Y00', 'Y10', 'Y20', 'Y30', 'Y40', 'Y50', 'Y51', 'Y52', 'Y42',
    'Y32', 'Y22', 'Y12', 'Y02', 'B20', 'B21', 'B22', 'B23', 'B24', 'B25',
    'B15', 'B14', 'B13', 'B12', 'B11', 'B10', 'BF',
  ],
  [PlayerColor.GREEN]: [
    'G21', 'G22', 'G23', 'G24', 'G25', 'Y00', 'Y10', 'Y20', 'Y30', 'Y40',
    'Y50', 'Y51', 'Y52', 'Y42', 'Y32', 'Y22', 'Y12', 'Y02', 'B20', 'B21',
    'B22', 'B23', 'B24', 'B25', 'B15', 'B05', 'B04', 'B03', 'B02', 'B01',
    'B00', 'R52', 'R42', 'R32', 'R22', 'R12', 'R02', 'R01', 'R00', 'R10',
    'R20', 'R30', 'R40', 'R50', 'G05', 'G04', 'G03', 'G02', 'G01', 'G00',
    'G10', 'G11', 'G12', 'G13', 'G14', 'G15', 'GF',
  ],
  [PlayerColor.RED]: [
    'R10', 'R20', 'R30', 'R40', 'R50', 'G05', 'G04', 'G03', 'G02', 'G01',
    'G00', 'G10', 'G20', 'G21', 'G22', 'G23', 'G24', 'G25', 'Y00', 'Y10',
    'Y20', 'Y30', 'Y40', 'Y50', 'Y51', 'Y52', 'Y42', 'Y32', 'Y22', 'Y12',
    'Y02', 'B20', 'B21', 'B22', 'B23', 'B24', 'B25', 'B15', 'B05', 'B04',
    'B03', 'B02', 'B01', 'B00', 'R52', 'R42', 'R32', 'R22', 'R12', 'R02',
    'R01', 'R11', 'R21', 'R31', 'R41', 'R51', 'RF',
  ],
  [PlayerColor.YELLOW]: [
    'Y42', 'Y32', 'Y22', 'Y12', 'Y02', 'B20', 'B21', 'B22', 'B23', 'B24',
    'B25', 'B15', 'B05', 'B04', 'B03', 'B02', 'B01', 'B00', 'R52', 'R42',
    'R32', 'R22', 'R12', 'R02', 'R01', 'R00', 'R10', 'R20', 'R30', 'R40',
    'R50', 'G05', 'G04', 'G03', 'G02', 'G01', 'G00', 'G10', 'G20', 'G21',
    'G22', 'G23', 'G24', 'G25', 'Y00', 'Y10', 'Y20', 'Y30', 'Y40', 'Y50',
    'Y51', 'Y41', 'Y31', 'Y21', 'Y11', 'Y01', 'YF',
  ],
};

// Base positions for each color (where tokens start)
export const BASE_POSITIONS: Record<PlayerColor, string[]> = {
  [PlayerColor.BLUE]: ['B1', 'B2', 'B3', 'B4'],
  [PlayerColor.GREEN]: ['G1', 'G2', 'G3', 'G4'],
  [PlayerColor.RED]: ['R1', 'R2', 'R3', 'R4'],
  [PlayerColor.YELLOW]: ['Y1', 'Y2', 'Y3', 'Y4'],
};

// Starting positions on the board for each color
export const START_POSITIONS: Record<PlayerColor, string> = {
  [PlayerColor.BLUE]: 'B04',
  [PlayerColor.GREEN]: 'G21',
  [PlayerColor.RED]: 'R10',
  [PlayerColor.YELLOW]: 'Y42',
};

// Final positions (home) for each color
export const HOME_POSITIONS: Record<PlayerColor, string> = {
  [PlayerColor.BLUE]: 'BF',
  [PlayerColor.GREEN]: 'GF',
  [PlayerColor.RED]: 'RF',
  [PlayerColor.YELLOW]: 'YF',
};

// Safe spots where tokens cannot be captured
export const SAFE_SPOTS = ['B04', 'B23', 'R22', 'R10', 'G02', 'G21', 'Y30', 'Y42'];

/**
 * Check if a token is in base (home spot before starting)
 */
export function isTokenInBase(positionId: string): boolean {
  return positionId.length === 2 && !positionId.endsWith('F');
}

/**
 * Check if a token is on the board
 */
export function isTokenOnBoard(positionId: string): boolean {
  return positionId.length === 3;
}

/**
 * Check if a token is in the final home position
 */
export function isTokenInHome(positionId: string): boolean {
  return positionId.endsWith('F');
}

/**
 * Get the token path for a specific color
 */
export function getTokenPath(color: PlayerColor): string[] {
  return TOKEN_PATHS[color];
}

/**
 * Validate if a move is possible given the dice value
 */
export function canMoveToken(
  tokenPosition: string,
  diceValue: number,
  color: PlayerColor
): { valid: boolean; targetPosition?: string; reason?: string } {
  // Token in base can only move out with a 6
  if (isTokenInBase(tokenPosition)) {
    if (diceValue === 6) {
      return { valid: true, targetPosition: START_POSITIONS[color] };
    }
    return { valid: false, reason: 'Need a 6 to move out of base' };
  }

  // Token on board or in home path
  const path = getTokenPath(color);
  const currentIndex = path.indexOf(tokenPosition);

  if (currentIndex === -1) {
    return { valid: false, reason: 'Invalid token position' };
  }

  const targetIndex = currentIndex + diceValue;

  // Check if move exceeds the path length
  if (targetIndex >= path.length) {
    return { valid: false, reason: 'Move exceeds path length' };
  }

  return { valid: true, targetPosition: path[targetIndex] };
}

/**
 * Check if a position is a safe spot
 */
export function isSafeSpot(positionId: string): boolean {
  return SAFE_SPOTS.includes(positionId);
}

/**
 * Detect collision and determine if a token should be captured
 */
export function detectCollision(
  targetPosition: string,
  attackerColor: PlayerColor,
  allTokenPositions: Record<string, TokenPosition[]>
): { captured: boolean; capturedTokens: TokenPosition[] } {
  // Safe spots don't allow captures
  if (isSafeSpot(targetPosition)) {
    return { captured: false, capturedTokens: [] };
  }

  const capturedTokens: TokenPosition[] = [];

  // Check all other players' tokens at this position
  for (const [colorKey, tokens] of Object.entries(allTokenPositions)) {
    const color = colorKey as PlayerColor;
    if (color === attackerColor) continue;

    for (const token of tokens) {
      if (token.positionId === targetPosition) {
        capturedTokens.push(token);
      }
    }
  }

  return {
    captured: capturedTokens.length > 0,
    capturedTokens,
  };
}

/**
 * Check win condition - all 4 tokens in home
 */
export function checkWinCondition(
  color: PlayerColor,
  tokenPositions: TokenPosition[]
): boolean {
  const homePosition = HOME_POSITIONS[color];
  const tokensInHome = tokenPositions.filter(
    (token) => token.positionId === homePosition
  );
  return tokensInHome.length === 4;
}

/**
 * Get base position for a token
 */
export function getBasePosition(tokenId: string, color: PlayerColor): string {
  const basePositions = BASE_POSITIONS[color];
  const tokenNumber = parseInt(tokenId.charAt(tokenId.length - 1));
  return basePositions[tokenNumber - 1];
}

/**
 * Validate if it's a valid token ID for the given color
 */
export function isValidTokenId(tokenId: string, color: PlayerColor): boolean {
  const colorPrefix = color.charAt(0).toUpperCase();
  return tokenId.startsWith(colorPrefix + 'T') && tokenId.length === 3;
}

import { PlayerColor } from './Player';

export interface Token {
  tokenId: string;
  color: PlayerColor;
  positionId: string;
  isHome: boolean;
  isFinished: boolean;
}

export interface MoveTokenParams {
  roomCode: string;
  playerId: string;
  tokenId: string;
  targetPositionId: string;
}

export interface MoveResult {
  success: boolean;
  tokenId: string;
  fromPosition: string;
  toPosition: string;
  capturedTokenId?: string;
  extraTurn?: boolean;
}

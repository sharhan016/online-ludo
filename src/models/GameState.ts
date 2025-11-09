import { Player } from './Player';

export enum GamePhase {
  WAITING = 'waiting',
  ROLLING = 'rolling',
  MOVING = 'moving',
  FINISHED = 'finished',
}

export interface TokenPosition {
  tokenId: string;
  positionId: string;
}

export interface PlayerRank {
  playerId: string;
  rank: number;
  finishedAt: Date;
}

export interface GameState {
  roomCode: string;
  players: Player[];
  currentPlayerIndex: number;
  diceValue: number | null;
  tokenPositions: Record<string, TokenPosition[]>; // Key is player color
  phase: GamePhase;
  rankings: PlayerRank[];
  consecutiveSixes: number; // Track consecutive sixes for current player
  startedAt?: Date;
  finishedAt?: Date;
}

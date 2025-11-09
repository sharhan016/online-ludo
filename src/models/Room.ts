import { Player } from './Player';

export enum RoomStatus {
  WAITING = 'waiting',
  PLAYING = 'playing',
  FINISHED = 'finished',
}

export interface Room {
  roomCode: string;
  hostId: string;
  players: string[]; // Array of player IDs (internal storage)
  spectators?: string[]; // Array of spectator player IDs
  status: RoomStatus;
  maxPlayers: number;
  createdAt: Date;
}

export interface RoomWithPlayers {
  roomCode: string;
  hostId: string;
  players: Player[]; // Array of full player objects (for client response)
  status: RoomStatus;
  maxPlayers: number;
  createdAt: Date;
}

export interface CreateRoomParams {
  hostId: string;
  maxPlayers?: number;
}

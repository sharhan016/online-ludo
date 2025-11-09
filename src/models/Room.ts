export enum RoomStatus {
  WAITING = 'waiting',
  PLAYING = 'playing',
  FINISHED = 'finished',
}

export interface Room {
  roomCode: string;
  hostId: string;
  players: string[]; // Array of player IDs
  spectators?: string[]; // Array of spectator player IDs
  status: RoomStatus;
  maxPlayers: number;
  createdAt: Date;
}

export interface CreateRoomParams {
  hostId: string;
  maxPlayers?: number;
}

export enum PlayerColor {
  RED = 'red',
  BLUE = 'blue',
  GREEN = 'green',
  YELLOW = 'yellow',
}

export enum ConnectionStatus {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  RECONNECTING = 'reconnecting',
}

export interface Player {
  playerId: string;
  playerName: string;
  color: PlayerColor;
  connectionStatus: ConnectionStatus;
  isSpectator: boolean;
  rank: number;
  socketId?: string;
}

export interface PlayerSession {
  playerId: string;
  playerName: string;
  roomCode?: string;
  socketId: string;
  lastActivity: Date;
}

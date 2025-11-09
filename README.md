# Ludo Game Server

Real-time multiplayer Ludo game server built with Node.js, Socket.io, and Redis.

## Features

- Real-time multiplayer gameplay using WebSocket connections
- Room-based game sessions with invite codes
- Automatic matchmaking system
- Player reconnection handling
- Spectator mode support
- Server-authoritative game logic to prevent cheating

## Prerequisites

- Node.js 18+ 
- Redis server
- npm or yarn

## Installation

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Edit .env with your configuration
```

## Development

```bash
# Start development server with hot reload
npm run dev
```

The server will start on `http://localhost:3000` (or the port specified in `.env`).

## Production

```bash
# Build TypeScript to JavaScript
npm run build

# Start production server
npm start
```

## Project Structure

```
server/
├── src/
│   ├── handlers/          # Socket.io event handlers
│   ├── services/          # Business logic services
│   ├── models/            # Data models and types
│   ├── utils/             # Utility functions
│   ├── config/            # Configuration
│   └── index.ts           # Server entry point
├── dist/                  # Compiled JavaScript (generated)
├── package.json
├── tsconfig.json
└── .env
```

## Environment Variables

See `.env.example` for all available configuration options.

## API Events

### Room Events
- `create_room` - Create a new game room
- `join_room` - Join an existing room
- `leave_room` - Leave current room
- `start_game` - Start the game (host only)

### Game Events
- `roll_dice` - Roll the dice
- `move_token` - Move a token
- `game_state_update` - Receive game state updates

### Matchmaking Events
- `join_matchmaking` - Join matchmaking queue
- `leave_matchmaking` - Leave matchmaking queue
- `match_found` - Notification when match is found

## License

MIT

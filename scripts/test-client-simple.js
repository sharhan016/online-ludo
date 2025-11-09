#!/usr/bin/env node

/**
 * Simple interactive test client for the Ludo multiplayer server
 * Usage: node test-client-simple.js
 */

const io = require('socket.io-client');
const readline = require('readline');

const SERVER_URL = 'http://localhost:3000';
let socket;
let currentRoom = null;
let playerId = `player-${Math.random().toString(36).substring(7)}`;
let playerName = `TestPlayer-${Math.random().toString(36).substring(7)}`;

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '> '
});

console.log('🎮 Ludo Multiplayer Test Client');
console.log('================================');
console.log(`Player ID: ${playerId}`);
console.log(`Player Name: ${playerName}`);
console.log('');

// Connect to server
socket = io(SERVER_URL, {
  transports: ['websocket'],
  reconnection: true,
});

// Connection events
socket.on('connect', () => {
  console.log('✅ Connected to server');
  console.log(`Socket ID: ${socket.id}`);
  console.log('');
  showHelp();
  rl.prompt();
});

socket.on('disconnect', () => {
  console.log('❌ Disconnected from server');
  rl.prompt();
});

socket.on('error', (error) => {
  console.log('❌ Error:', error);
  rl.prompt();
});

// Room events
socket.on('room_created', (data) => {
  console.log('✅ Room created:', data.room.roomCode);
  currentRoom = data.room.roomCode;
  rl.prompt();
});

socket.on('player_joined', (data) => {
  console.log('👤 Player joined:', data.player?.playerName || 'Unknown');
  console.log('   Players in room:', data.room.players.length);
  rl.prompt();
});

socket.on('player_left', (data) => {
  console.log('👋 Player left:', data.playerId);
  rl.prompt();
});

socket.on('game_started', (data) => {
  console.log('🎮 Game started!');
  console.log('   Players:', data.gameState.players.length);
  rl.prompt();
});

socket.on('dice_rolled', (data) => {
  console.log(`🎲 Dice rolled: ${data.diceValue} (Player: ${data.playerId})`);
  rl.prompt();
});

socket.on('game_state_update', (data) => {
  console.log('📊 Game state updated');
  console.log('   Current player index:', data.currentPlayerIndex);
  console.log('   Phase:', data.phase);
  rl.prompt();
});

socket.on('match_found', (data) => {
  console.log('🎯 Match found!');
  console.log('   Room code:', data.roomCode);
  console.log('   Players:', data.players.length);
  currentRoom = data.roomCode;
  rl.prompt();
});

socket.on('matchmaking_update', (data) => {
  console.log('🔍 Matchmaking update - Queue size:', data.queueSize);
  rl.prompt();
});

// Handle user input
rl.on('line', (line) => {
  const input = line.trim().toLowerCase();
  const parts = input.split(' ');
  const command = parts[0];

  switch (command) {
    case 'help':
    case 'h':
      showHelp();
      break;

    case 'create':
    case 'c':
      createRoom();
      break;

    case 'join':
    case 'j':
      if (parts[1]) {
        joinRoom(parts[1].toUpperCase());
      } else {
        console.log('❌ Usage: join <room-code>');
      }
      break;

    case 'leave':
    case 'l':
      leaveRoom();
      break;

    case 'start':
    case 's':
      startGame();
      break;

    case 'matchmaking':
    case 'm':
      joinMatchmaking();
      break;

    case 'roll':
    case 'r':
      rollDice();
      break;

    case 'status':
      showStatus();
      break;

    case 'quit':
    case 'exit':
    case 'q':
      console.log('👋 Goodbye!');
      process.exit(0);
      break;

    default:
      if (input) {
        console.log('❌ Unknown command. Type "help" for available commands.');
      }
  }

  rl.prompt();
});

// Command functions
function showHelp() {
  console.log('Available commands:');
  console.log('  create (c)           - Create a new room');
  console.log('  join <code> (j)      - Join a room with code');
  console.log('  leave (l)            - Leave current room');
  console.log('  start (s)            - Start the game (host only)');
  console.log('  matchmaking (m)      - Join matchmaking queue');
  console.log('  roll (r)             - Roll dice');
  console.log('  status               - Show current status');
  console.log('  help (h)             - Show this help');
  console.log('  quit (q)             - Exit');
  console.log('');
}

function createRoom() {
  console.log('📝 Creating room...');
  socket.emit('create_room', {
    playerId,
    playerName,
    maxPlayers: 4
  }, (response) => {
    if (response.error) {
      console.log('❌ Error:', response.error);
    } else {
      console.log('✅ Room created:', response.room.roomCode);
      currentRoom = response.room.roomCode;
    }
    rl.prompt();
  });
}

function joinRoom(roomCode) {
  console.log(`📝 Joining room ${roomCode}...`);
  socket.emit('join_room', {
    roomCode,
    playerId,
    playerName
  }, (response) => {
    if (response.error) {
      console.log('❌ Error:', response.error);
    } else {
      console.log('✅ Joined room:', roomCode);
      currentRoom = roomCode;
    }
    rl.prompt();
  });
}

function leaveRoom() {
  if (!currentRoom) {
    console.log('❌ Not in a room');
    rl.prompt();
    return;
  }

  console.log('📝 Leaving room...');
  socket.emit('leave_room', {
    roomCode: currentRoom,
    playerId
  }, (response) => {
    if (response.error) {
      console.log('❌ Error:', response.error);
    } else {
      console.log('✅ Left room');
      currentRoom = null;
    }
    rl.prompt();
  });
}

function startGame() {
  if (!currentRoom) {
    console.log('❌ Not in a room');
    rl.prompt();
    return;
  }

  console.log('📝 Starting game...');
  socket.emit('start_game', {
    roomCode: currentRoom,
    playerId
  }, (response) => {
    if (response.error) {
      console.log('❌ Error:', response.error);
    } else {
      console.log('✅ Game started!');
    }
    rl.prompt();
  });
}

function joinMatchmaking() {
  console.log('📝 Joining matchmaking...');
  socket.emit('join_matchmaking', {
    playerId,
    playerName,
    preferredPlayers: 4
  }, (response) => {
    if (response.error) {
      console.log('❌ Error:', response.error);
    } else {
      console.log('✅ Joined matchmaking queue');
      console.log('   Queue size:', response.queueSize);
    }
    rl.prompt();
  });
}

function rollDice() {
  if (!currentRoom) {
    console.log('❌ Not in a room');
    rl.prompt();
    return;
  }

  console.log('📝 Rolling dice...');
  socket.emit('roll_dice', {
    roomCode: currentRoom,
    playerId
  });
}

function showStatus() {
  console.log('📊 Current Status:');
  console.log('   Connected:', socket.connected);
  console.log('   Socket ID:', socket.id);
  console.log('   Player ID:', playerId);
  console.log('   Player Name:', playerName);
  console.log('   Current Room:', currentRoom || 'None');
  console.log('');
}

// Handle Ctrl+C
rl.on('SIGINT', () => {
  console.log('\n👋 Goodbye!');
  process.exit(0);
});

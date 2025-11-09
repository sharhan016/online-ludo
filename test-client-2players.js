/**
 * Socket.IO Test Client for Ludo Game Server - 2 Players
 * Run with: node test-client-2players.js
 */

const io = require('socket.io-client');

// Player 1
const player1 = {
  playerId: 'player-1',
  playerName: 'Alice',
  socket: null,
};

// Player 2
const player2 = {
  playerId: 'player-2',
  playerName: 'Bob',
  socket: null,
};

let roomCode = null;
let gameStarted = false;

// Connect Player 1
player1.socket = io('http://localhost:3000', {
  transports: ['websocket'],
});

// Connect Player 2
player2.socket = io('http://localhost:3000', {
  transports: ['websocket'],
});

// Player 1 events
player1.socket.on('connect', () => {
  console.log('✅ Player 1 (Alice) connected - Socket ID:', player1.socket.id);
});

player1.socket.on('room_created', (data) => {
  console.log('🏠 Room created by Player 1:', data.room.roomCode);
  roomCode = data.room.roomCode;
  
  // Player 2 joins after room is created
  setTimeout(() => {
    console.log('\n👤 Player 2 (Bob) joining room...');
    player2.socket.emit('join_room', {
      roomCode: roomCode,
      playerId: player2.playerId,
      playerName: player2.playerName,
    });
  }, 1000);
});

player1.socket.on('room_updated', (data) => {
  console.log('👥 Room updated - Player count:', data.room.players.length);
  
  // If we have 2 players, Player 1 can start the game
  if (data.room.players.length === 2 && !gameStarted) {
    setTimeout(() => {
      console.log('\n🎮 Player 1 starting the game...');
      player1.socket.emit('start_game', {
        roomCode: roomCode,
        playerId: player1.playerId,
      });
    }, 1000);
  }
});

player1.socket.on('game_started', (data) => {
  console.log('🎮 Game started!', data);
  gameStarted = true;
  
  // Start playing after game starts
  setTimeout(() => {
    playGame();
  }, 1000);
});

player1.socket.on('dice_rolled', (data) => {
  console.log(`🎲 [Player 1] Dice rolled: ${data.diceValue}`);
});

player1.socket.on('token_moved', (data) => {
  console.log(`🎯 [Player 1] Token moved: ${data.tokenId} from ${data.fromPosition} to ${data.toPosition}`);
  if (data.capturedTokenId) {
    console.log(`   💥 Captured token: ${data.capturedTokenId}`);
  }
});

player1.socket.on('game_state_update', (data) => {
  console.log(`📊 [Player 1] Game state updated - Current player: ${data.players[data.currentPlayerIndex].playerName}`);
});

player1.socket.on('error', (error) => {
  console.error('❌ [Player 1] Error:', error);
});

// Player 2 events
player2.socket.on('connect', () => {
  console.log('✅ Player 2 (Bob) connected - Socket ID:', player2.socket.id);
});

player2.socket.on('room_updated', (data) => {
  console.log('👥 Player 2 received room update:', data.room.players.length, 'players');
});

player2.socket.on('dice_rolled', (data) => {
  console.log(`🎲 [Player 2] Dice rolled: ${data.diceValue}`);
});

player2.socket.on('token_moved', (data) => {
  console.log(`🎯 [Player 2] Token moved: ${data.tokenId} from ${data.fromPosition} to ${data.toPosition}`);
});

player2.socket.on('game_state_update', (data) => {
  console.log(`📊 [Player 2] Game state updated - Current player: ${data.players[data.currentPlayerIndex].playerName}`);
});

player2.socket.on('error', (error) => {
  console.error('❌ [Player 2] Error:', error);
});

// Start test sequence
async function runTests() {
  console.log('\n=== Starting 2-Player Test Sequence ===\n');
  
  await sleep(1000);
  
  // Player 1 creates room
  console.log('📝 Player 1 (Alice) creating room...');
  player1.socket.emit('create_room', {
    playerId: player1.playerId,
    playerName: player1.playerName,
    preferredPlayers: 2,
  });
}

// Play game - Player 1 rolls and moves
async function playGame() {
  console.log('\n=== Starting Game Play ===\n');
  
  await sleep(1000);
  
  // Player 1 rolls dice
  console.log('🎲 Player 1 rolling dice...');
  player1.socket.emit('roll_dice', {
    roomCode: roomCode,
    playerId: player1.playerId,
  });
  
  await sleep(2000);
  
  // Player 1 tries to move token (will work if dice was 6)
  console.log('🎯 Player 1 attempting to move token...');
  player1.socket.emit('move_token', {
    roomCode: roomCode,
    playerId: player1.playerId,
    tokenId: 'BT1',
    targetPositionId: 'B04',
  });
  
  await sleep(2000);
  
  console.log('\n=== Test Complete ===');
  console.log('Press Ctrl+C to exit\n');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\nClosing connections...');
  player1.socket.close();
  player2.socket.close();
  process.exit(0);
});

// Wait for both players to connect, then start tests
setTimeout(() => {
  if (player1.socket.connected && player2.socket.connected) {
    runTests();
  } else {
    console.error('❌ Failed to connect both players');
    process.exit(1);
  }
}, 2000);

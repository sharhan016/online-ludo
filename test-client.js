/**
 * Socket.IO Test Client for Ludo Game Server
 * Run with: node test-client.js
 */

const io = require('socket.io-client');

// Connect to server
const socket = io('http://localhost:3000', {
  transports: ['websocket'],
});

// Test data
const testPlayer = {
  playerId: 'test-player-1',
  playerName: 'TestPlayer1',
};

let testRoomCode = null; // Will be set when room is created

// Connection events
socket.on('connect', () => {
  console.log('✅ Connected to server');
  console.log('Socket ID:', socket.id);
  
  // Start test sequence
  runTests();
});

socket.on('disconnect', () => {
  console.log('❌ Disconnected from server');
});

socket.on('error', (error) => {
  console.error('❌ Error:', error);
});

// Game events
socket.on('room_created', (data) => {
  console.log('🏠 Room created:', data);
  testRoomCode = data.room.roomCode; // Save the room code from the room object
});

socket.on('game_started', (data) => {
  console.log('🎮 Game started:', data);
});

socket.on('dice_rolled', (data) => {
  console.log('🎲 Dice rolled:', data);
});

socket.on('token_moved', (data) => {
  console.log('🎯 Token moved:', data);
});

socket.on('game_state_update', (data) => {
  console.log('📊 Game state updated:', JSON.stringify(data, null, 2));
});

// Test sequence
async function runTests() {
  console.log('\n--- Starting Test Sequence ---\n');

  // Test 1: Create room
  console.log('Test 1: Creating room...');
  socket.emit('create_room', {
    playerId: testPlayer.playerId,
    playerName: testPlayer.playerName,
    preferredPlayers: 2,
  });

  await sleep(1500);

  if (!testRoomCode) {
    console.log('❌ Failed to create room');
    process.exit(1);
  }

  console.log(`✅ Room code: ${testRoomCode}`);

  // Test 2: Start game
  console.log('\nTest 2: Starting game...');
  socket.emit('start_game', {
    roomCode: testRoomCode,
    playerId: testPlayer.playerId,
  });

  await sleep(1500);

  // Test 3: Roll dice
  console.log('\nTest 3: Rolling dice...');
  socket.emit('roll_dice', {
    roomCode: testRoomCode,
    playerId: testPlayer.playerId,
  });

  await sleep(1500);

  // Test 4: Roll dice again (need a 6 to move out of base)
  console.log('\nTest 4: Rolling dice again (trying to get a 6)...');
  socket.emit('roll_dice', {
    roomCode: testRoomCode,
    playerId: testPlayer.playerId,
  });

  await sleep(1500);

  // Test 5: Move token (if we got a 6)
  console.log('\nTest 5: Attempting to move token...');
  socket.emit('move_token', {
    roomCode: testRoomCode,
    playerId: testPlayer.playerId,
    tokenId: 'BT1',
    targetPositionId: 'B04',
  });

  await sleep(2000);

  console.log('\n--- Test Sequence Complete ---\n');
  console.log('Press Ctrl+C to exit');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\nClosing connection...');
  socket.close();
  process.exit(0);
});

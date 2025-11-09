# Testing the Ludo Game Server

This guide explains how to test the server-side game engine implementation.

## Prerequisites

1. **Start Redis** (required for the server):
   ```bash
   # macOS with Homebrew
   brew services start redis
   
   # Or run directly
   redis-server
   ```

2. **Start the Server**:
   ```bash
   cd server
   npm install
   npm run dev
   ```

   The server should start on `http://localhost:3000`

## Testing Methods

### Option 1: Browser-Based Test Client (Recommended)

1. Open `server/test-client.html` in your browser
2. Click "Connect" to connect to the server
3. Use the UI to test different game actions:
   - Create Room
   - Join Room
   - Start Game
   - Roll Dice
   - Move Token

**Advantages:**
- Visual interface
- Real-time event log
- Easy to use
- No additional setup

### Option 2: Node.js Test Script

1. Install socket.io-client:
   ```bash
   cd server
   npm install socket.io-client
   ```

2. Run the test script:
   ```bash
   node test-client.js
   ```

**Advantages:**
- Automated test sequence
- Good for quick validation
- Can be modified for specific test cases

### Option 3: Postman (Limited Support)

Postman now supports WebSocket connections:

1. Create a new WebSocket request
2. Connect to: `ws://localhost:3000`
3. Send JSON messages:
   ```json
   {
     "event": "roll_dice",
     "data": {
       "roomCode": "TEST123",
       "playerId": "test-player-1"
     }
   }
   ```

**Note:** Socket.IO uses a custom protocol, so raw WebSocket testing is limited.

## Test Scenarios

### Scenario 1: Basic Game Flow

1. **Create a room**:
   ```javascript
   emit('create_room', {
     playerId: 'player1',
     playerName: 'Alice',
     preferredPlayers: 2
   })
   ```

2. **Join with second player** (open another browser tab):
   ```javascript
   emit('join_room', {
     roomCode: 'ABCD12',
     playerId: 'player2',
     playerName: 'Bob'
   })
   ```

3. **Start the game**:
   ```javascript
   emit('start_game', {
     roomCode: 'ABCD12',
     playerId: 'player1'
   })
   ```

4. **Roll dice**:
   ```javascript
   emit('roll_dice', {
     roomCode: 'ABCD12',
     playerId: 'player1'
   })
   ```

5. **Move token** (if dice is 6):
   ```javascript
   emit('move_token', {
     roomCode: 'ABCD12',
     playerId: 'player1',
     tokenId: 'BT1',
     targetPositionId: 'B04'
   })
   ```

### Scenario 2: Test Turn Management

1. Roll dice multiple times to test:
   - Normal turn switching (dice != 6)
   - Extra turn on rolling 6
   - Three consecutive sixes (turn skip)

### Scenario 3: Test Token Capture

1. Move tokens to the same position
2. Verify captured token returns to base
3. Verify attacker gets extra turn

### Scenario 4: Test Win Condition

1. Move all 4 tokens to home position
2. Verify player ranking
3. Verify game finish when all but one player completes

## Expected Events

### Server → Client Events

- `room_created` - Room successfully created
- `player_joined` - Player joined the room
- `game_started` - Game has started
- `dice_rolled` - Dice was rolled with value
- `token_moved` - Token moved to new position
- `game_state_update` - Full game state update
- `error` - Error occurred

### Client → Server Events

- `create_room` - Create a new room
- `join_room` - Join existing room
- `start_game` - Start the game
- `roll_dice` - Roll the dice
- `move_token` - Move a token

## Debugging Tips

1. **Check server logs**: The server logs all events and errors
2. **Use browser DevTools**: Check the Network tab for WebSocket frames
3. **Verify Redis**: Use `redis-cli` to inspect stored data:
   ```bash
   redis-cli
   KEYS *
   GET game:ABCD12
   ```

4. **Check game state**: The `game_state_update` event shows the complete state

## Common Issues

### Connection Failed
- Ensure server is running on port 3000
- Check CORS settings in `server/src/config/index.ts`
- Verify firewall settings

### "Not your turn" Error
- Check `currentPlayerIndex` in game state
- Ensure you're using the correct `playerId`

### "Invalid move" Error
- Verify dice was rolled first
- Check token position is valid
- Ensure target position matches calculated position

### Redis Connection Error
- Start Redis: `redis-server`
- Check Redis connection in server logs

## Next Steps

After validating the game engine:
1. Test with multiple concurrent games
2. Test reconnection scenarios
3. Load test with many players
4. Integrate with Flutter client

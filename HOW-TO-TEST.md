# How to Test the Ludo Game Server

## Quick Start

### 1. Start Redis
```bash
redis-server
```
Keep this terminal open.

### 2. Start the Server
```bash
cd server
npm run dev
```
Keep this terminal open. Server runs on `http://localhost:3000`

### 3. Open the Test Client
Open `server/test-client.html` in your browser (double-click the file or drag it into your browser).

## Testing with 2 Players

The game requires at least 2 players. Here's how to test:

### Option A: Two Browser Tabs (Recommended)

1. **Tab 1 (Player 1 - Host):**
   - Click "Connect"
   - Click "1️⃣ Create Room"
   - **Copy the room code** that appears (e.g., "ABC123")
   - Wait for Player 2 to join

2. **Tab 2 (Player 2):**
   - Open another tab with the same `test-client.html` file
   - Click "Connect"
   - **Paste the room code** in the "Room Code" field
   - Click "2️⃣ Join Room"

3. **Back to Tab 1:**
   - Click "3️⃣ Start Game" (only the host can start)
   - Now you can play!

4. **Play the Game:**
   - Click "🎲 Roll Dice" to roll
   - If you get a **6**, you can move a token out of base
   - Select the token and target position, then click "🎯 Move Token"

### Option B: Regular + Incognito Window

1. Open `test-client.html` in a regular browser window (Player 1)
2. Open `test-client.html` in an incognito/private window (Player 2)
3. Follow the same steps as Option A

### Option C: Two Different Browsers

1. Open `test-client.html` in Chrome (Player 1)
2. Open `test-client.html` in Safari/Firefox (Player 2)
3. Follow the same steps as Option A

## Game Rules Reminder

- **Roll a 6** to move a token out of base
- **Starting positions:**
  - Blue: `B04`
  - Green: `G21`
  - Red: `R10`
  - Yellow: `Y42`
- **Extra turn:** You get an extra turn if you:
  - Roll a 6
  - Capture an opponent's token
- **Three consecutive 6s:** Your turn is skipped

## What to Test

### ✅ Basic Flow
1. Create room
2. Join room with second player
3. Start game
4. Roll dice
5. Move tokens

### ✅ Turn Management
- Normal turn switching
- Extra turn on rolling 6
- Three consecutive sixes (turn skip)

### ✅ Token Movement
- Moving out of base (requires 6)
- Moving on board
- Token capture
- Returning captured tokens to base

### ✅ Win Condition
- Move all 4 tokens to home position
- Check player rankings

## Troubleshooting

### "Not connected to server"
- Make sure the server is running (`npm run dev`)
- Check that Redis is running (`redis-server`)

### "Game not found"
- Make sure you started the game first
- Check that you're using the correct room code

### "Not your turn"
- Wait for your turn
- Check the "Current turn" in the game state update logs

### "Need a 6 to move out of base"
- Keep rolling until you get a 6
- Only tokens in base require a 6 to move out

## Event Log

The test client shows all events in real-time:
- 🏠 Room events (created, joined)
- 🎮 Game events (started, finished)
- 🎲 Dice rolls
- 🎯 Token movements
- 📊 Game state updates
- ❌ Errors

## Tips

1. **Keep both tabs visible** side-by-side to see real-time updates
2. **Check the event log** to understand what's happening
3. **Auto-generated names** - Each tab gets a random player name (Alice, Bob, etc.)
4. **Room codes** are automatically filled after creation/joining
5. **Color-coded logs** - Success (green), Error (red), Info (blue), Warning (yellow)

## Next Steps

Once you've verified the game works:
1. Test with more players (up to 4)
2. Test reconnection scenarios
3. Test edge cases (disconnections, invalid moves)
4. Integrate with your Flutter app

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const {
  createRoom,
  joinRoom,
  getRoom,
  removePlayer,
} = require('./roomManager');

const {
  initGame,
  rollDice,
  getValidMoves,
  moveToken,
} = require('./gameLogic');

// ---------- Express setup ----------
const app = express();

// Allow requests from your frontend domain(s)
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  process.env.FRONTEND_URL, // set this in Render's env vars
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

app.use(express.json());

app.get('/', (req, res) => {
  res.send('🎲 Ludo Server is running');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ---------- HTTP + Socket.IO server ----------
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'], // important for Render
});

// ---------- Socket.IO events ----------
io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);

  // Create room
  socket.on('createRoom', ({ playerName, maxPlayers }, callback) => {
    try {
      const room = createRoom(socket.id, playerName, maxPlayers);
      socket.join(room.code);
      console.log(`Room ${room.code} created by ${playerName}`);
      if (callback) callback({ success: true, room });
      io.to(room.code).emit('roomUpdate', room);
    } catch (err) {
      console.error(err);
      if (callback) callback({ success: false, message: 'Server error' });
    }
  });

  // Get current room state
  socket.on('getRoom', ({ code }, callback) => {
    const room = getRoom(code);
    if (callback) callback({ room: room || null });
  });

  // Join room
  socket.on('joinRoom', ({ roomCode, playerName }, callback) => {
    const result = joinRoom(roomCode, socket.id, playerName);
    if (!result.success) return callback(result);

    socket.join(roomCode);
    console.log(`${playerName} joined room ${roomCode}`);
    callback({ success: true, room: result.room });
    io.to(roomCode).emit('roomUpdate', result.room);
  });

  // Start game
  socket.on('startGame', ({ roomCode }, callback) => {
    const room = getRoom(roomCode);
    if (!room) return callback({ success: false, message: 'Room not found' });
    if (room.hostId !== socket.id)
      return callback({ success: false, message: 'Only host can start' });
    if (room.players.length < 2)
      return callback({ success: false, message: 'Need at least 2 players' });

    room.gameState = initGame(room.players);
    room.status = 'playing';

    io.to(roomCode).emit('gameStarted', room);
    callback({ success: true });
    console.log(`Game started in room ${roomCode}`);
  });

  // Roll dice
  socket.on('rollDice', ({ roomCode }) => {
    const room = getRoom(roomCode);
    if (!room || !room.gameState) return;

    const player = room.players.find((p) => p.socketId === socket.id);
    if (!player) return;

    const diceValue = rollDice(room.gameState, player.id);
    if (diceValue === null) return;

    const validMoves = getValidMoves(room.gameState, player.id, diceValue);

    io.to(roomCode).emit('diceRolled', {
      playerId: player.id,
      diceValue,
      validMoves,
      currentTurn: room.gameState.currentTurn,
    });
  });

  // Move token
  socket.on('moveToken', ({ roomCode, tokenIndex }, callback) => {
    const room = getRoom(roomCode);
    if (!room || !room.gameState) return;

    const player = room.players.find((p) => p.socketId === socket.id);
    if (!player) return;

    const result = moveToken(room.gameState, player.id, tokenIndex);
    if (!result.success) {
      if (callback) callback(result);
      return;
    }

    io.to(roomCode).emit('tokenMoved', {
      playerId: player.id,
      tokenIndex,
      gameState: room.gameState,
      nextTurn: room.gameState.currentTurn,
      captured: result.captured,
    });

    if (result.winner !== undefined) {
      io.to(roomCode).emit('gameOver', {
        winner: player.id,
        playerName: player.name,
      });
    }

    if (callback) callback({ success: true });
  });

  // Chat
  socket.on('chatMessage', ({ roomCode, message }) => {
    const room = getRoom(roomCode);
    if (!room) return;
    const player = room.players.find((p) => p.socketId === socket.id);
    io.to(roomCode).emit('chatMessage', {
      name: player?.name || 'Unknown',
      message,
      timestamp: Date.now(),
    });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('❌ User disconnected:', socket.id);
    const result = removePlayer(socket.id);
    if (result && result.room) {
      io.to(result.roomCode).emit('roomUpdate', result.room);
      io.to(result.roomCode).emit('playerLeft', { playerId: result.playerId });
    }
  });
});

// ---------- Start server ----------
const PORT = process.env.PORT || 4000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Ludo server running on port ${PORT}`);
});

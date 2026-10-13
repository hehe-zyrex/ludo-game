const rooms = new Map();

const COLORS = ['red', 'green', 'yellow', 'blue', 'purple', 'orange'];

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function createRoom(hostSocketId, hostName, maxPlayers) {
  const code = generateCode();
  const room = {
    code,
    hostId: hostSocketId,
    maxPlayers: Math.min(Math.max(Number(maxPlayers) || 4, 2), 6),
    players: [
      {
        id: 0,
        socketId: hostSocketId,
        name: hostName,
        color: COLORS[0],
        ready: true,
      },
    ],
    status: 'waiting',
    gameState: null,
    createdAt: Date.now(),
  };
  rooms.set(code, room);
  return room;
}

function joinRoom(code, socketId, playerName) {
  const room = rooms.get(code);
  if (!room) return { success: false, message: 'Room not found' };
  if (room.status !== 'waiting')
    return { success: false, message: 'Game already started' };
  if (room.players.length >= room.maxPlayers)
    return { success: false, message: 'Room is full' };

  // Prevent duplicate socketIds
  if (room.players.some((p) => p.socketId === socketId)) {
    return { success: false, message: 'Already in room' };
  }

  const playerId = room.players.length;
  room.players.push({
    id: playerId,
    socketId,
    name: playerName,
    color: COLORS[playerId],
    ready: true,
  });
  return { success: true, room };
}

function getRoom(code) {
  return rooms.get(code);
}

function findRoomBySocket(socketId) {
  for (const room of rooms.values()) {
    if (room.players.some((p) => p.socketId === socketId)) return room;
  }
  return null;
}

function removePlayer(socketId) {
  const room = findRoomBySocket(socketId);
  if (!room) return null;

  const idx = room.players.findIndex((p) => p.socketId === socketId);
  const playerId = room.players[idx].id;
  room.players.splice(idx, 1);

  // Delete room if empty
  if (room.players.length === 0) {
    rooms.delete(room.code);
    return { roomCode: room.code, playerId, room: null };
  }

  // Reassign IDs, colors, and host if needed
  room.players.forEach((p, i) => {
    p.id = i;
    p.color = COLORS[i];
  });

  if (room.hostId === socketId) {
    room.hostId = room.players[0].socketId;
  }

  return { roomCode: room.code, playerId, room };
}

module.exports = {
  createRoom,
  joinRoom,
  getRoom,
  removePlayer,
  findRoomBySocket,
};

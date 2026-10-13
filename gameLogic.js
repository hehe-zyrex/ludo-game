const TRACK_LENGTH = 52;
const TOKENS_PER_PLAYER = 4;
const FINISH_POSITION = 57;

// Starting position on the main 52-cell track for each player index
const START_POSITIONS = {
  0: 0,   // red
  1: 13,  // green
  2: 26,  // yellow
  3: 39,  // blue
  4: 8,   // purple (custom)
  5: 21,  // orange (custom)
};

const SAFE_CELLS = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

function initGame(players) {
  return {
    players: players.map((p) => ({
      id: p.id,
      color: p.color,
      name: p.name,
      tokens: Array(TOKENS_PER_PLAYER).fill(-1), // -1 = in base
      finished: 0,
    })),
    currentTurn: 0,
    diceValue: null,
    hasRolled: false,
    consecutiveSixes: 0,
    lastMove: null,
  };
}

function rollDice(gameState, playerId) {
  if (gameState.currentTurn !== playerId) return null;
  if (gameState.hasRolled) return null;

  const value = Math.floor(Math.random() * 6) + 1;
  gameState.diceValue = value;
  gameState.hasRolled = true;

  if (value === 6) {
    gameState.consecutiveSixes++;
    if (gameState.consecutiveSixes === 3) {
      // Three sixes in a row: forfeit turn
      gameState.consecutiveSixes = 0;
      gameState.hasRolled = false;
      gameState.diceValue = null;
      gameState.currentTurn = (gameState.currentTurn + 1) % gameState.players.length;
    }
  } else {
    gameState.consecutiveSixes = 0;
  }

  return value;
}

function isBlocked(gameState, playerId, dest, movingTokenIdx) {
  if (dest < 0 || dest >= TRACK_LENGTH) return false;

  const absDest = (START_POSITIONS[playerId] + dest) % TRACK_LENGTH;
  let count = 0;

  for (const p of gameState.players) {
    if (p.id === playerId) continue;
    const oppStart = START_POSITIONS[p.id];
    p.tokens.forEach((pos) => {
      if (pos < 0 || pos >= TRACK_LENGTH) return;
      const absPos = (oppStart + pos) % TRACK_LENGTH;
      if (absPos === absDest) count++;
    });
  }
  return count >= 2;
}

function getValidMoves(gameState, playerId, diceValue) {
  const player = gameState.players.find((p) => p.id === playerId);
  if (!player) return [];

  const moves = [];

  player.tokens.forEach((pos, idx) => {
    if (pos === FINISH_POSITION) return;

    if (pos === -1) {
      // Only a 6 can bring a token out of base
      if (diceValue === 6) {
        if (!isBlocked(gameState, playerId, 0, idx)) {
          moves.push({ tokenIndex: idx, from: -1, to: 0 });
        }
      }
    } else {
      const newPos = pos + diceValue;
      if (newPos > FINISH_POSITION) return; // must land exactly on 57
      if (!isBlocked(gameState, playerId, newPos, idx)) {
        moves.push({ tokenIndex: idx, from: pos, to: newPos });
      }
    }
  });

  return moves;
}

function moveToken(gameState, playerId, tokenIndex) {
  if (gameState.currentTurn !== playerId)
    return { success: false, message: 'Not your turn' };
  if (!gameState.hasRolled)
    return { success: false, message: 'Roll dice first' };

  const player = gameState.players.find((p) => p.id === playerId);
  const validMoves = getValidMoves(gameState, playerId, gameState.diceValue);
  const move = validMoves.find((m) => m.tokenIndex === tokenIndex);

  if (!move) return { success: false, message: 'Invalid move' };

  player.tokens[tokenIndex] = move.to;

  let captured = [];

  // Check captures on main track
  if (move.to >= 0 && move.to < TRACK_LENGTH) {
    const absPos = (START_POSITIONS[playerId] + move.to) % TRACK_LENGTH;
    if (!SAFE_CELLS.has(absPos)) {
      for (const p of gameState.players) {
        if (p.id === playerId) continue;
        const oppStart = START_POSITIONS[p.id];
        p.tokens.forEach((pos, idx) => {
          if (pos < 0 || pos >= TRACK_LENGTH) return;
          const oppAbs = (oppStart + pos) % TRACK_LENGTH;
          if (oppAbs === absPos) {
            p.tokens[idx] = -1;
            captured.push({ playerId: p.id, tokenIndex: idx });
          }
        });
      }
    }
  }

  // Update finish count
  player.finished = player.tokens.filter((t) => t === FINISH_POSITION).length;

  // Win check
  if (player.tokens.every((t) => t === FINISH_POSITION)) {
    return { success: true, captured, winner: playerId };
  }

  // Determine next turn
  const gotSix = gameState.diceValue === 6;
  const capturedSomeone = captured.length > 0;
  const reachedHome = move.to === FINISH_POSITION;

  if (!gotSix && !capturedSomeone && !reachedHome) {
    gameState.currentTurn = (gameState.currentTurn + 1) % gameState.players.length;
  }

  gameState.hasRolled = false;
  gameState.diceValue = null;

  return { success: true, captured };
}

module.exports = {
  initGame,
  rollDice,
  getValidMoves,
  moveToken,
  TRACK_LENGTH,
  START_POSITIONS,
  SAFE_CELLS,
};

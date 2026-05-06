const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const db = require('./database');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));
app.use(express.json());

const PORT = process.env.PORT || 3000;

const SUITS = ['♠', '♣', '♦', '♥'];
const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
const rankValue = Object.fromEntries(RANKS.map((rank, index) => [rank, index + 3]));
const suitValue = { '♠': 1, '♣': 2, '♦': 3, '♥': 4 };

function createDeck() {
  const deck = [];

  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        id: `${rank}${suit}`,
        rank,
        suit,
        value: rankValue[rank]
      });
    }
  }

  return deck;
}

function shuffle(cards) {
  const arr = [...cards];

  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr;
}

function cardPower(card) {
  return card.value * 10 + suitValue[card.suit];
}

function sortCards(cards) {
  return [...cards].sort((a, b) => cardPower(a) - cardPower(b));
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || '');
  } catch {
    return fallback;
  }
}

function getHighest(cards) {
  return sortCards(cards)[cards.length - 1];
}

function getPlayType(cards) {
  if (!cards.length) return null;

  const sorted = sortCards(cards);
  const values = sorted.map(card => card.value);
  const ranks = sorted.map(card => card.rank);

  const blockedRanks = ['J', 'Q', 'K', 'A', '2'];
  const hasBlockedRank = ranks.some(rank => blockedRanks.includes(rank));

  if (cards.length === 1) {
    return {
      type: 'single',
      highCard: getHighest(cards)
    };
  }

  const isSameRank = new Set(ranks).size === 1;

  if (isSameRank) {
    return {
      type: `same-${cards.length}`,
      highCard: getHighest(cards)
    };
  }

  const uniqueValues = [...new Set(values)];

  if (uniqueValues.length !== values.length) {
    return null;
  }

  const isNormalStraight =
    cards.length >= 3 &&
    !hasBlockedRank &&
    values.every((value, index) => {
      if (index === 0) return true;
      return value === values[index - 1] + 1;
    });

  if (isNormalStraight) {
    return {
      type: `straight-${cards.length}`,
      highCard: getHighest(cards)
    };
  }

  const isOddStraight =
    cards.length >= 3 &&
    !hasBlockedRank &&
    values.every(value => value % 2 === 1) &&
    values.every((value, index) => {
      if (index === 0) return true;
      return value === values[index - 1] + 2;
    });

  if (isOddStraight) {
    return {
      type: `odd-straight-${cards.length}`,
      highCard: getHighest(cards)
    };
  }

  const isEvenStraight =
    cards.length >= 3 &&
    !hasBlockedRank &&
    values.every(value => value % 2 === 0) &&
    values.every((value, index) => {
      if (index === 0) return true;
      return value === values[index - 1] + 2;
    });

  if (isEvenStraight) {
    return {
      type: `even-straight-${cards.length}`,
      highCard: getHighest(cards)
    };
  }

  return null;
}

function isValidPlay(selectedCards, lastPlayCards) {
  if (!selectedCards.length) return false;

  const selectedPlay = getPlayType(selectedCards);
  if (!selectedPlay) return false;

  if (!lastPlayCards.length) return true;

  const lastPlay = getPlayType(lastPlayCards);
  if (!lastPlay) return false;

  if (selectedPlay.type !== lastPlay.type) return false;

  return cardPower(selectedPlay.highCard) > cardPower(lastPlay.highCard);
}

function getUserByName(username) {
  let user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (!user) {
    const result = db.prepare(`
      INSERT INTO users (username, chips, wins, losses)
      VALUES (?, ?, ?, ?)
    `).run(username, 1000, 0, 0);

    user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  }

  return user;
}

function getRoomState(roomId) {
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId);
  if (!room) return null;

  const players = db.prepare(`
    SELECT rp.*, u.username, u.chips, u.wins, u.losses
    FROM room_players rp
    JOIN users u ON u.id = rp.user_id
    WHERE rp.room_id = ?
    ORDER BY rp.seat ASC
  `).all(roomId).map(player => {
    const hand = parseJson(player.hand, []);
    return {
      userId: player.user_id,
      username: player.username,
      chips: player.chips,
      wins: player.wins,
      losses: player.losses,
      seat: player.seat,
      hand,
      cardCount: hand.length,
      passed: Boolean(player.passed)
    };
  });

  return {
    id: room.id,
    name: room.name,
    status: room.status,
    maxPlayers: room.max_players,
    currentTurnUserId: room.current_turn_user_id,
    lastPlayUserId: room.last_play_user_id,
    lastPlayCards: parseJson(room.last_play_cards, []),
    players
  };
}

function getPublicRoomState(roomId, viewerUserId) {
  const state = getRoomState(roomId);
  if (!state) return null;

  return {
    ...state,
    players: state.players.map(player => ({
      ...player,
      hand: player.userId === viewerUserId ? player.hand : []
    }))
  };
}

function emitRoom(roomId) {
  const state = getRoomState(roomId);
  if (!state) return;

  for (const player of state.players) {
    io.to(`user:${player.userId}`).emit('roomState', getPublicRoomState(roomId, player.userId));
  }
}

function logAction(roomId, userId, action, data = {}) {
  db.prepare(`
    INSERT INTO game_logs (room_id, user_id, action, data)
    VALUES (?, ?, ?, ?)
  `).run(roomId, userId, action, JSON.stringify(data));
}

function getNextPlayer(roomId, fromUserId) {
  const state = getRoomState(roomId);
  const players = state.players.filter(player => player.cardCount > 0);
  const startIndex = players.findIndex(player => player.userId === fromUserId);

  for (let step = 1; step <= players.length; step++) {
    const candidate = players[(startIndex + step) % players.length];
    if (!candidate.passed && candidate.cardCount > 0) {
      return candidate;
    }
  }

  return players[0];
}

function moveTurn(roomId, fromUserId) {
  const state = getRoomState(roomId);
  const notFinished = state.players.filter(player => player.cardCount > 0);

  if (notFinished.length <= 1) {
    const winner = notFinished[0];

    if (winner) {
      db.prepare('UPDATE users SET wins = wins + 1, chips = chips + 100 WHERE id = ?').run(winner.userId);
      db.prepare('UPDATE users SET losses = losses + 1 WHERE id != ?').run(winner.userId);
      db.prepare('UPDATE rooms SET status = ?, current_turn_user_id = NULL WHERE id = ?').run('finished', roomId);
      logAction(roomId, winner.userId, 'win', { username: winner.username });
    }

    return;
  }

  const available = notFinished.filter(player => !player.passed);

  if (available.length <= 1) {
    db.prepare('UPDATE room_players SET passed = 0 WHERE room_id = ?').run(roomId);
    db.prepare(`
      UPDATE rooms
      SET last_play_cards = '[]', last_play_user_id = NULL
      WHERE id = ?
    `).run(roomId);

    const next = getNextPlayer(roomId, fromUserId);
    db.prepare('UPDATE rooms SET current_turn_user_id = ? WHERE id = ?').run(next.userId, roomId);
    return;
  }

  const next = getNextPlayer(roomId, fromUserId);
  db.prepare('UPDATE rooms SET current_turn_user_id = ? WHERE id = ?').run(next.userId, roomId);
}

app.get('/api/rooms', (req, res) => {
  const rooms = db.prepare(`
    SELECT r.*, COUNT(rp.id) AS player_count
    FROM rooms r
    LEFT JOIN room_players rp ON rp.room_id = r.id
    GROUP BY r.id
    ORDER BY r.id DESC
  `).all();

  res.json(rooms);
});

app.post('/api/rooms', (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 50) || 'Phong moi';
  const result = db.prepare(`
    INSERT INTO rooms (name, status, max_players)
    VALUES (?, 'waiting', 4)
  `).run(name);

  res.json({ id: result.lastInsertRowid, name });
});

io.on('connection', socket => {
  socket.on('login', username => {
    username = String(username || '').trim().slice(0, 20);

    if (!username) {
      socket.emit('errorMessage', 'Vui long nhap ten nguoi choi.');
      return;
    }

    const user = getUserByName(username);
    socket.data.user = user;
    socket.join(`user:${user.id}`);
    socket.emit('loggedIn', user);
  });

  socket.on('joinRoom', roomId => {
    const user = socket.data.user;
    if (!user) return;

    roomId = Number(roomId);
    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId);

    if (!room) {
      socket.emit('errorMessage', 'Khong tim thay phong.');
      return;
    }

    const alreadyJoined = db.prepare(`
      SELECT * FROM room_players WHERE room_id = ? AND user_id = ?
    `).get(roomId, user.id);

    if (!alreadyJoined) {
      const count = db.prepare('SELECT COUNT(*) AS total FROM room_players WHERE room_id = ?').get(roomId).total;

      if (count >= room.max_players) {
        socket.emit('errorMessage', 'Phong da du nguoi.');
        return;
      }

      const usedSeats = db.prepare('SELECT seat FROM room_players WHERE room_id = ?').all(roomId).map(row => row.seat);
      let seat = 1;

      while (usedSeats.includes(seat)) seat++;

      db.prepare(`
        INSERT INTO room_players (room_id, user_id, seat, hand, passed)
        VALUES (?, ?, ?, '[]', 0)
      `).run(roomId, user.id, seat);

      logAction(roomId, user.id, 'join_room', { username: user.username });
    }

    socket.data.roomId = roomId;
    socket.join(`room:${roomId}`);
    emitRoom(roomId);
  });

  socket.on('startGame', () => {
    const user = socket.data.user;
    const roomId = socket.data.roomId;

    if (!user || !roomId) return;

    const state = getRoomState(roomId);

    if (state.players.length < 2) {
      socket.emit('errorMessage', 'Can it nhat 2 nguoi de bat dau.');
      return;
    }

    let deck = shuffle(createDeck());

    for (const player of state.players) {
      const hand = sortCards(deck.splice(0, 13));

      db.prepare(`
        UPDATE room_players
        SET hand = ?, passed = 0
        WHERE room_id = ? AND user_id = ?
      `).run(JSON.stringify(hand), roomId, player.userId);
    }

    db.prepare(`
      UPDATE rooms
      SET status = 'playing',
          current_turn_user_id = ?,
          last_play_user_id = NULL,
          last_play_cards = '[]'
      WHERE id = ?
    `).run(state.players[0].userId, roomId);

    logAction(roomId, user.id, 'start_game');
    emitRoom(roomId);
  });

  socket.on('playCards', cardIds => {
    const user = socket.data.user;
    const roomId = socket.data.roomId;

    if (!user || !roomId) return;

    const state = getRoomState(roomId);

    if (state.status !== 'playing') {
      socket.emit('errorMessage', 'Van bai chua bat dau.');
      return;
    }

    if (state.currentTurnUserId !== user.id) {
      socket.emit('errorMessage', 'Chua den luot ban.');
      return;
    }

    const player = state.players.find(item => item.userId === user.id);
    const ids = Array.isArray(cardIds) ? cardIds : [];
    const selectedCards = player.hand.filter(card => ids.includes(card.id));

    if (selectedCards.length !== ids.length) {
      socket.emit('errorMessage', 'La bai khong hop le.');
      return;
    }

    if (!isValidPlay(selectedCards, state.lastPlayCards)) {
      socket.emit('errorMessage', 'Bai danh khong hop le. Hay danh cung so luong va lon hon bai truoc.');
      return;
    }

    const remainingHand = player.hand.filter(card => !ids.includes(card.id));

    db.prepare(`
      UPDATE room_players
      SET hand = ?, passed = 0
      WHERE room_id = ? AND user_id = ?
    `).run(JSON.stringify(sortCards(remainingHand)), roomId, user.id);

    db.prepare(`
      UPDATE rooms
      SET last_play_cards = ?, last_play_user_id = ?
      WHERE id = ?
    `).run(JSON.stringify(sortCards(selectedCards)), user.id, roomId);

    logAction(roomId, user.id, 'play_cards', { cards: selectedCards });
    moveTurn(roomId, user.id);
    emitRoom(roomId);
  });

  socket.on('passTurn', () => {
    const user = socket.data.user;
    const roomId = socket.data.roomId;

    if (!user || !roomId) return;

    const state = getRoomState(roomId);

    if (state.status !== 'playing') return;

    if (state.currentTurnUserId !== user.id) {
      socket.emit('errorMessage', 'Chua den luot ban.');
      return;
    }

    if (!state.lastPlayCards.length) {
      socket.emit('errorMessage', 'Ban dang mo vong moi nen khong duoc bo luot.');
      return;
    }

    db.prepare(`
      UPDATE room_players
      SET passed = 1
      WHERE room_id = ? AND user_id = ?
    `).run(roomId, user.id);

    logAction(roomId, user.id, 'pass_turn');
    moveTurn(roomId, user.id);
    emitRoom(roomId);
  });

  socket.on('resetGame', () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    db.prepare(`
      UPDATE room_players
      SET hand = '[]', passed = 0
      WHERE room_id = ?
    `).run(roomId);

    db.prepare(`
      UPDATE rooms
      SET status = 'waiting',
          current_turn_user_id = NULL,
          last_play_user_id = NULL,
          last_play_cards = '[]'
      WHERE id = ?
    `).run(roomId);

    emitRoom(roomId);
  });
    socket.on('disconnect', () => {
    const user = socket.data.user;
    const roomId = socket.data.roomId;

    if (!user || !roomId) return;

    db.prepare(`
      DELETE FROM room_players
      WHERE room_id = ? AND user_id = ?
    `).run(roomId, user.id);

    logAction(roomId, user.id, 'leave_room', { username: user.username });
    emitRoom(roomId);
  });
});

server.listen(PORT, () => {
  console.log(`Server dang chay tai http://localhost:${PORT}`);
});

const socket = io();

let currentUser = null;
let currentRoom = null;
let selectedCardIds = new Set();

const loginScreen = document.getElementById('loginScreen');
const gameScreen = document.getElementById('gameScreen');
const usernameInput = document.getElementById('usernameInput');
const loginBtn = document.getElementById('loginBtn');
const playerBox = document.getElementById('playerBox');
const roomNameInput = document.getElementById('roomNameInput');
const createRoomBtn = document.getElementById('createRoomBtn');
const roomList = document.getElementById('roomList');
const roomTitle = document.getElementById('roomTitle');
const roomStatus = document.getElementById('roomStatus');
const messageBox = document.getElementById('messageBox');
const playersEl = document.getElementById('players');
const lastPlayEl = document.getElementById('lastPlay');
const myHandEl = document.getElementById('myHand');
const startGameBtn = document.getElementById('startGameBtn');
const resetGameBtn = document.getElementById('resetGameBtn');
const playBtn = document.getElementById('playBtn');
const passBtn = document.getElementById('passBtn');

function showMessage(text) {
  messageBox.textContent = text;
}

function cardColor(card) {
  return card.suit === '♦' || card.suit === '♥' ? 'red' : '';
}

function createCardElement(card, selectable = false) {
  const div = document.createElement('div');
  div.className = `card ${cardColor(card)} ${selectable ? 'selectable' : ''}`;
  div.dataset.id = card.id;

  if (selectedCardIds.has(card.id)) {
    div.classList.add('selected');
  }

  div.innerHTML = `
    <div>${card.rank}${card.suit}</div>
    <div class="bottom">${card.rank}${card.suit}</div>
  `;

  if (selectable) {
    div.addEventListener('click', () => {
      if (selectedCardIds.has(card.id)) {
        selectedCardIds.delete(card.id);
      } else {
        selectedCardIds.add(card.id);
      }

      renderRoom(currentRoom);
    });
  }

  return div;
}

async function loadRooms() {
  const res = await fetch('/api/rooms');
  const rooms = await res.json();

  roomList.innerHTML = '';

  for (const room of rooms) {
    const div = document.createElement('div');
    div.className = 'room-item';
    div.innerHTML = `
      <strong>${room.name}</strong><br />
      <small>${room.player_count}/${room.max_players} người - ${room.status}</small>
    `;

    div.addEventListener('click', () => {
      socket.emit('joinRoom', room.id);
      showMessage(`Đang vào phòng ${room.name}...`);
    });

    roomList.appendChild(div);
  }
}

function renderPlayers(room) {
  playersEl.innerHTML = '';

  for (const player of room.players) {
    const div = document.createElement('div');
    div.className = 'player-card';

    if (player.userId === room.currentTurnUserId) {
      div.classList.add('active');
    }

    if (player.passed) {
      div.classList.add('passed');
    }

    div.innerHTML = `
      <strong>Ghế ${player.seat}: ${player.username}</strong><br />
      <small>Bài: ${player.cardCount} lá</small><br />
      <small>Chip: ${player.chips}</small><br />
      <small>Thắng: ${player.wins} | Thua: ${player.losses}</small><br />
      <small>${player.passed ? 'Đã bỏ lượt' : 'Đang chơi'}</small>
    `;

    playersEl.appendChild(div);
  }
}

function renderLastPlay(room) {
  lastPlayEl.innerHTML = '';

  if (!room.lastPlayCards.length) {
    lastPlayEl.textContent = 'Chưa có bài trên bàn';
    lastPlayEl.classList.add('empty');
    return;
  }

  lastPlayEl.classList.remove('empty');

  for (const card of room.lastPlayCards) {
    lastPlayEl.appendChild(createCardElement(card, false));
  }
}

function renderMyHand(room) {
  myHandEl.innerHTML = '';

  const me = room.players.find(player => player.userId === currentUser.id);

  if (!me || !me.hand.length) {
    myHandEl.textContent = 'Bạn chưa có bài.';
    myHandEl.classList.add('empty');
    return;
  }

  myHandEl.classList.remove('empty');

  const validIds = new Set(me.hand.map(card => card.id));
  selectedCardIds = new Set([...selectedCardIds].filter(id => validIds.has(id)));

  for (const card of me.hand) {
    myHandEl.appendChild(createCardElement(card, true));
  }
}

function renderRoom(room) {
  if (!room) return;

  currentRoom = room;

  roomTitle.textContent = room.name;
  roomStatus.textContent = `Trạng thái: ${room.status}`;

  renderPlayers(room);
  renderLastPlay(room);
  renderMyHand(room);

  const isMyTurn = room.currentTurnUserId === currentUser.id;

  playBtn.disabled = room.status !== 'playing' || !isMyTurn;
  passBtn.disabled = room.status !== 'playing' || !isMyTurn;
  startGameBtn.disabled = room.status === 'playing';

  if (room.status === 'finished') {
    showMessage('Ván bài đã kết thúc. Bấm Reset để chơi lại.');
  } else if (isMyTurn) {
    showMessage('Đến lượt bạn. Chọn bài rồi bấm Đánh bài.');
  } else if (room.currentTurnUserId) {
    const current = room.players.find(player => player.userId === room.currentTurnUserId);
    showMessage(`Đang chờ ${current ? current.username : 'người chơi khác'} đánh bài.`);
  }
}

loginBtn.addEventListener('click', () => {
  const username = usernameInput.value.trim();
  socket.emit('login', username);
});

usernameInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') loginBtn.click();
});

createRoomBtn.addEventListener('click', async () => {
  const name = roomNameInput.value.trim() || 'Phòng mới';

  const res = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });

  const room = await res.json();
  roomNameInput.value = '';

  await loadRooms();
  socket.emit('joinRoom', room.id);
});

startGameBtn.addEventListener('click', () => {
  selectedCardIds.clear();
  socket.emit('startGame');
});

resetGameBtn.addEventListener('click', () => {
  selectedCardIds.clear();
  socket.emit('resetGame');
});

playBtn.addEventListener('click', () => {
  const ids = [...selectedCardIds];

  if (!ids.length) {
    showMessage('Bạn chưa chọn lá bài nào.');
    return;
  }

  socket.emit('playCards', ids);
  selectedCardIds.clear();
});

passBtn.addEventListener('click', () => {
  selectedCardIds.clear();
  socket.emit('passTurn');
});

socket.on('loggedIn', user => {
  currentUser = user;
  playerBox.textContent = `${user.username} - ${user.chips} chip`;
  loginScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  loadRooms();
});

socket.on('roomState', room => {
  currentRoom = room;
  renderRoom(room);
  loadRooms();
});

socket.on('errorMessage', message => {
  showMessage(message);
});

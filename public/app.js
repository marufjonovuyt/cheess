const socket = io("https://cheess.onrender.com");
let board = null;
let game = null;
let myColor = null;
let currentRoom = null;

const boardEl = document.getElementById('board');
const createBtn = document.getElementById('createBtn');
const joinBtn = document.getElementById('joinBtn');
const roomInput = document.getElementById('roomInput');
const roomLabel = document.getElementById('roomLabel');
const myColorEl = document.getElementById('myColor');
const turnEl = document.getElementById('turn');
const statusEl = document.getElementById('status');
const movesList = document.getElementById('movesList');

function initBoard(fen) {
  game = new Chess(fen);
  const cfg = {
    draggable: true,
    position: game.fen(),
    onDrop: handleDrop,
    orientation: myColor === 'b' ? 'black' : 'white'
  };
  if (board) board.destroy();
  board = Chessboard('board', cfg);
  updateUI();
}

function handleDrop(source, target) {
  // validate via chess.js
  if (!game) return 'snapback';
  const move = game.move({ from: source, to: target, promotion: 'q' });
  if (move === null) {
    return 'snapback';
  }
  // send to server
  socket.emit('makeMove', { roomId: currentRoom, from: source, to: target, promotion: 'q' }, (res) => {
    if (!res.ok) {
      // illegal or not your turn
      game.undo();
      board.position(game.fen());
      alert(res.err || 'Move rejected');
    } else {
      // move accepted — server will broadcast moveMade
    }
  });
}

createBtn.onclick = () => {
  socket.emit('createRoom', (res) => {
    if (res.ok) {
      currentRoom = res.roomId;
      myColor = res.color;
      roomLabel.textContent = `Room: ${currentRoom}`;
      myColorEl.textContent = myColor;
      initBoard(res.fen);
      alert('Room yaradildi. Room ID: ' + currentRoom);
    } else {
      alert('Error creating room');
    }
  });
};

joinBtn.onclick = () => {
  const roomId = roomInput.value.trim();
  if (!roomId) return alert('Room ID kiriting');
  socket.emit('joinRoom', { roomId }, (res) => {
    if (!res.ok) return alert(res.err || 'Join failed');
    currentRoom = roomId;
    myColor = res.color; // null if spectator
    roomLabel.textContent = `Room: ${currentRoom}`;
    myColorEl.textContent = myColor || 'spectator';
    initBoard(res.fen);
    if (res.spectator) alert('You joined as spectator');
  });
};

socket.on('startGame', ({ fen, playersCount }) => {
  if(!currentRoom) return;
  initBoard(fen);
  statusEl.textContent = `Players: ${playersCount}`;
});

socket.on('moveMade', ({ from, to, san, fen, checkmate, draw, in_check }) => {
  if (!game) {
    game = new Chess(fen);
  } else {
    game.load(fen);
  }
  board.position(fen);
  addMoveToList(san);
  updateUI();
  if (checkmate) {
    alert('Checkmate!');
  } else if (draw) {
    alert('Draw!');
  }
});

socket.on('playerLeft', ({ playersCount }) => {
  statusEl.textContent = `Players: ${playersCount}`;
});

function addMoveToList(san) {
  const li = document.createElement('li');
  li.textContent = san;
  movesList.appendChild(li);
}

function updateUI() {
  if (!game) return;
  turnEl.textContent = game.turn() === 'w' ? 'White' : 'Black';
  // enable/disable dragging for spectator or when not your turn
  const turn = game.turn();
  if (board && myColor) {
    const canMove = (myColor === turn);
    board.draggable = canMove;
    // Chessboard.js doesn't fully support dynamic draggable change in some versions,
    // but we rebuild position on every update so it's fine for this simple app.
  }
}

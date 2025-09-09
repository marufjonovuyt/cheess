const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Chess } = require('chess.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {}; // { roomId: { chess: Chess, players: [socketId,...], colorMap: {socketId: 'w'|'b'} } }

io.on('connection', socket => {
  console.log('conn:', socket.id);

  socket.on('createRoom', (cb) => {
    // generate short room id
    const id = Math.random().toString(36).slice(2,8);
    rooms[id] = { chess: new Chess(), players: [socket.id], colorMap: { }, spectators: [] };
    rooms[id].colorMap[socket.id] = 'w'; // creator is white
    socket.join(id);
    cb({ ok: true, roomId: id, color: 'w', fen: rooms[id].chess.fen() });
    console.log('Room created', id);
  });

  socket.on('joinRoom', ({ roomId }, cb) => {
    const room = rooms[roomId];
    if(!room) return cb({ ok: false, err: 'Room not found' });
    if(room.players.length >= 2) {
      // join as spectator
      room.spectators.push(socket.id);
      socket.join(roomId);
      return cb({ ok: true, spectator: true, color: null, fen: room.chess.fen() });
    }
    room.players.push(socket.id);
    socket.join(roomId);
    // assign black to joiner
    room.colorMap[socket.id] = 'b';
    // notify both players about start
    io.to(roomId).emit('startGame', { fen: room.chess.fen(), playersCount: room.players.length, colors: room.colorMap });
    return cb({ ok: true, color: 'b', fen: room.chess.fen() });
  });

  socket.on('makeMove', ({ roomId, from, to, promotion }, cb) => {
    const room = rooms[roomId];
    if(!room) return cb({ ok: false, err: 'Room not found' });
    const chess = room.chess;
    const playerColor = room.colorMap[socket.id] || null;
    if(!playerColor) return cb({ ok: false, err: 'You are spectator or not in room' });
    // ensure turn
    const turn = chess.turn(); // 'w' or 'b'
    if(playerColor !== turn) return cb({ ok: false, err: "Not your turn" });

    const move = chess.move({ from, to, promotion });
    if(move === null) return cb({ ok: false, err: "Illegal move" });

    // broadcast move and new FEN to room
    io.to(roomId).emit('moveMade', { from, to, san: move.san, fen: chess.fen(), checkmate: chess.in_checkmate(), draw: chess.in_draw(), in_check: chess.in_check() });
    cb({ ok: true });
  });

  socket.on('getFen', ({ roomId }, cb) => {
    const room = rooms[roomId];
    if(!room) return cb({ ok: false, err: 'Room not found' });
    cb({ ok: true, fen: room.chess.fen(), turn: room.chess.turn() });
  });

  socket.on('leaveRoom', ({ roomId }) => {
    const room = rooms[roomId];
    if(!room) return;
    socket.leave(roomId);
    // remove from players or spectators
    room.players = room.players.filter(id => id !== socket.id);
    room.spectators = (room.spectators || []).filter(id => id !== socket.id);
    delete room.colorMap[socket.id];
    io.to(roomId).emit('playerLeft', { playersCount: room.players.length });
    // if no players & no spectators → delete room
    if(room.players.length === 0 && (!room.spectators || room.spectators.length === 0)) {
      delete rooms[roomId];
      console.log('Deleted room', roomId);
    }
  });

  socket.on('disconnect', () => {
    console.log('disc', socket.id);
    // remove from any room
    for(const id of Object.keys(rooms)) {
      const room = rooms[id];
      if(room.players.includes(socket.id)) {
        room.players = room.players.filter(x => x !== socket.id);
        delete room.colorMap[socket.id];
        io.to(id).emit('playerLeft', { playersCount: room.players.length });
      }
      room.spectators = (room.spectators||[]).filter(x=>x!==socket.id);
      if(room.players.length === 0 && (!room.spectators || room.spectators.length === 0)) {
        delete rooms[id];
        console.log('Deleted room', id);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server on', PORT));

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const { Chess } = require("chess.js");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// 🔥 Muhimi: public papkani berib qo‘yish
app.use(express.static(path.join(__dirname, "public")));

const rooms = {}; 
// { roomId: { chess: Chess, players: [socketId,...], colorMap: {socketId: 'w'|'b'}, spectators: [] } }

io.on("connection", (socket) => {
  console.log("conn:", socket.id);

  socket.on("createRoom", (cb) => {
    const id = Math.random().toString(36).slice(2, 8); // random room id
    rooms[id] = {
      chess: new Chess(),
      players: [socket.id],
      colorMap: {},
      spectators: []
    };
    rooms[id].colorMap[socket.id] = "w"; // creator is white
    socket.join(id);
    cb({ ok: true, roomId: id, color: "w", fen: rooms[id].chess.fen() });
    console.log("Room created", id);
  });

  socket.on("joinRoom", ({ roomId }, cb) => {
    const room = rooms[roomId];
    if (!room) return cb({ ok: false, err: "Room not found" });

    if (room.players.length < 2) {
      room.players.push(socket.id);
      room.colorMap[socket.id] = "b"; // joiner is black
      socket.join(roomId);
      cb({ ok: true, roomId, color: "b", fen: room.chess.fen() });
    } else {
      room.spectators.push(socket.id);
      socket.join(roomId);
      cb({ ok: true, roomId, color: "spectator", fen: room.chess.fen() });
    }
  });

  socket.on("move", ({ roomId, from, to }, cb) => {
    const room = rooms[roomId];
    if (!room) return cb({ ok: false, err: "Room not found" });

    const move = room.chess.move({ from, to });
    if (move) {
      io.to(roomId).emit("move", { from, to, fen: room.chess.fen() });
      cb({ ok: true, fen: room.chess.fen() });
    } else {
      cb({ ok: false, err: "Illegal move" });
    }
  });

  socket.on("disconnect", () => {
    console.log("disconnect:", socket.id);
    // cleanup qilish mumkin
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

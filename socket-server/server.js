const { createServer } = require("http");
const { Server } = require("socket.io");

const PORT           = parseInt(process.env.PORT ?? "3001", 10);
const ALLOWED_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:3000";
const MAX_ROOM_SIZE  = 20;
const MAX_MSG_LEN    = 1000;
const MAX_NAME_LEN   = 40;
const MAX_ROOM_ID_LEN = 60;
const ROOM_ID_RE     = /^[a-zA-Z0-9]{16}$/;
const NAME_RE        = /^[^\x00-\x1F<>"'`]{1,40}$/;

// Rate limiter
const MSG_LIMIT  = 10;
const MSG_WINDOW = 5000;
const msgRates   = new Map();

function isRateLimited(socketId) {
  const now   = Date.now();
  const entry = msgRates.get(socketId);
  if (!entry || now > entry.resetAt) {
    msgRates.set(socketId, { count: 1, resetAt: now + MSG_WINDOW });
    return false;
  }
  if (entry.count >= MSG_LIMIT) return true;
  entry.count++;
  return false;
}

function sanitize(str, maxLen) {
  if (typeof str !== "string") return null;
  return str.trim().slice(0, maxLen).replace(/<[^>]*>/g, "").replace(/[<>]/g, "");
}

const rooms      = new Map();
const roomOwners = new Map();

function addUserToRoom(roomId, user) {
  if (!rooms.has(roomId)) rooms.set(roomId, []);
  const list = rooms.get(roomId);
  if (!list.some(u => u.id === user.id)) list.push(user);
  if (!roomOwners.has(roomId)) roomOwners.set(roomId, user.id);
}

function removeUserFromRooms(socketId) {
  const affected = [];
  for (const [roomId, users] of rooms) {
    const filtered = users.filter(u => u.id !== socketId);
    if (filtered.length !== users.length) {
      affected.push(roomId);
      if (filtered.length === 0) {
        rooms.delete(roomId);
        roomOwners.delete(roomId);
      } else {
        rooms.set(roomId, filtered);
        if (roomOwners.get(roomId) === socketId)
          roomOwners.set(roomId, filtered[0].id);
      }
    }
  }
  return affected;
}

const httpServer = createServer((req, res) => {
  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", rooms: rooms.size }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(httpServer, {
  cors: {
    origin: ALLOWED_ORIGIN,
    methods: ["GET", "POST"],
    credentials: true,
  },
  maxHttpBufferSize: 1e5,
  pingTimeout: 20000,
  pingInterval: 25000,
});

io.use((socket, next) => {
  const origin = socket.handshake.headers.origin;
  if (origin && origin !== ALLOWED_ORIGIN && process.env.NODE_ENV === "production") {
    return next(new Error("Unauthorized origin"));
  }
  next();
});

io.on("connection", (socket) => {
  let joinedRoom = null;

  socket.on("join-room", (rawRoomId, rawName) => {
    const roomId = sanitize(rawRoomId, MAX_ROOM_ID_LEN);
    const name   = sanitize(rawName,   MAX_NAME_LEN);

    if (!roomId || !ROOM_ID_RE.test(roomId)) {
      socket.emit("error", "Invalid room ID.");
      return;
    }
    if (!name || !NAME_RE.test(name)) {
      socket.emit("error", "Invalid name.");
      return;
    }
    const list = rooms.get(roomId) ?? [];
    if (list.length >= MAX_ROOM_SIZE) {
      socket.emit("error", `Room is full (max ${MAX_ROOM_SIZE}).`);
      return;
    }
    if (joinedRoom && joinedRoom !== roomId) {
      socket.leave(joinedRoom);
      removeUserFromRooms(socket.id);
    }
    // Cancel any pending auto-delete timer when someone joins
    joinedRoom = roomId;
    socket.join(roomId);
    addUserToRoom(roomId, { id: socket.id, name });
    io.to(roomId).emit("room-users", rooms.get(roomId));
  });

  socket.on("leave-room", () => {
    if (!joinedRoom) return;
    const roomId = joinedRoom;
    joinedRoom = null;
    socket.leave(roomId);
    msgRates.delete(socket.id);
    const affected = removeUserFromRooms(socket.id);
    for (const rid of affected) {
      const remaining = rooms.get(rid);
      io.to(rid).emit("room-users", remaining ?? []);
    }
  });

  socket.on("send-message", (data) => {
    if (!joinedRoom || typeof data !== "object" || !data) return;
    if (isRateLimited(socket.id)) {
      socket.emit("error", "Slow down.");
      return;
    }
    const safeRoom    = sanitize(data.roomId,  MAX_ROOM_ID_LEN);
    const safeMessage = sanitize(data.message, MAX_MSG_LEN);
    const safeUser    = sanitize(data.user,    MAX_NAME_LEN);
    if (!safeRoom || !safeMessage || !safeUser || safeRoom !== joinedRoom) return;
    io.to(safeRoom).emit("receive-message", { user: safeUser, message: safeMessage });
  });

  socket.on("offer", (data) => {
    if (!joinedRoom || typeof data !== "object" || !data) return;
    const { target, offer } = data;
    if (typeof target !== "string") return;
    const roomUsers = rooms.get(joinedRoom) ?? [];
    if (!roomUsers.some(u => u.id === target)) return;
    socket.to(target).emit("offer", { offer, from: socket.id });
  });

  socket.on("answer", (data) => {
    if (!joinedRoom || typeof data !== "object" || !data) return;
    const { target, answer } = data;
    if (typeof target !== "string") return;
    const roomUsers = rooms.get(joinedRoom) ?? [];
    if (!roomUsers.some(u => u.id === target)) return;
    socket.to(target).emit("answer", { answer, from: socket.id });
  });

  socket.on("ice-candidate", (data) => {
    if (!joinedRoom || typeof data !== "object" || !data) return;
    const { target, candidate } = data;
    if (typeof target !== "string") return;
    const roomUsers = rooms.get(joinedRoom) ?? [];
    if (!roomUsers.some(u => u.id === target)) return;
    socket.to(target).emit("ice-candidate", { candidate, from: socket.id });
  });

  socket.on("disconnect", () => {
    msgRates.delete(socket.id);
    const affected = removeUserFromRooms(socket.id);
    for (const roomId of affected) {
      io.to(roomId).emit("room-users", rooms.get(roomId) ?? []);
    }
  });
});

process.on("SIGTERM", () => io.close(() => httpServer.close(() => process.exit(0))));
process.on("SIGINT",  () => io.close(() => httpServer.close(() => process.exit(0))));

httpServer.listen(PORT, () => {
  console.log(`🚀 Socket.IO → port ${PORT} | allowed origin: ${ALLOWED_ORIGIN}`);
});

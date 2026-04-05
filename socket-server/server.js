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

const rooms      = new Map(); // roomId -> [{ id, name, offline }]
const roomOwners = new Map(); // roomId -> socketId
// socketId -> roomId (which room this socket is currently in)
const socketRoom = new Map();

function addUserToRoom(roomId, user) {
  if (!rooms.has(roomId)) rooms.set(roomId, []);
  const list = rooms.get(roomId);
  const idx = list.findIndex(u => u.id === user.id);
  if (idx !== -1) list.splice(idx, 1);
  list.push({ ...user, offline: false });
  if (!roomOwners.has(roomId)) roomOwners.set(roomId, user.id);
  socketRoom.set(user.id, roomId);
}

// Mark user offline instead of removing; only remove room if owner leaves explicitly
function markUserOffline(socketId) {
  const roomId = socketRoom.get(socketId);
  if (!roomId) return null;
  const list = rooms.get(roomId);
  if (!list) return null;
  const user = list.find(u => u.id === socketId);
  if (user) user.offline = true;
  return roomId;
}

function removeUserFromRoom(socketId) {
  const roomId = socketRoom.get(socketId);
  if (!roomId) return null;
  socketRoom.delete(socketId);
  const list = rooms.get(roomId);
  if (!list) return null;
  const filtered = list.filter(u => u.id !== socketId);
  if (filtered.length === 0) {
    rooms.delete(roomId);
    roomOwners.delete(roomId);
  } else {
    rooms.set(roomId, filtered);
    if (roomOwners.get(roomId) === socketId)
      roomOwners.set(roomId, filtered.find(u => !u.offline)?.id ?? filtered[0].id);
  }
  return roomId;
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

  // pendingJoin: { roomId, name } waiting for user confirmation
  let pendingJoin = null;

  function doJoin(roomId, name) {
    if (joinedRoom && joinedRoom !== roomId) {
      socket.leave(joinedRoom);
      removeUserFromRoom(socket.id);
      const prev = joinedRoom;
      io.to(prev).emit("room-users", rooms.get(prev) ?? []);
    }
    joinedRoom = roomId;
    socket.join(roomId);
    addUserToRoom(roomId, { id: socket.id, name });
    io.to(roomId).emit("room-users", rooms.get(roomId));
    // Tell everyone who the owner is
    io.to(roomId).emit("room-owner", roomOwners.get(roomId));
  }

  socket.on("join-room", (rawRoomId, rawName) => {
    const roomId = sanitize(rawRoomId, MAX_ROOM_ID_LEN);
    const name   = sanitize(rawName,   MAX_NAME_LEN);

    if (!roomId || !ROOM_ID_RE.test(roomId)) { socket.emit("error", "Invalid room ID."); return; }
    if (!name || !NAME_RE.test(name))         { socket.emit("error", "Invalid name.");   return; }

    const list = rooms.get(roomId) ?? [];
    if (list.length >= MAX_ROOM_SIZE) { socket.emit("error", `Room is full (max ${MAX_ROOM_SIZE}).`); return; }

    // Already in this room — just re-join (reconnect)
    if (joinedRoom === roomId) { doJoin(roomId, name); return; }

    const currentRoom = socketRoom.get(socket.id);

    if (currentRoom && currentRoom !== roomId) {
      const isOwner = roomOwners.get(currentRoom) === socket.id;
      pendingJoin = { roomId, name };
      if (isOwner) {
        socket.emit("owner-room-conflict", { currentRoomId: currentRoom });
      } else {
        socket.emit("participant-room-conflict", { currentRoomId: currentRoom });
      }
      return;
    }

    doJoin(roomId, name);
  });

  // User confirmed they want to leave their current room and join the new one
  socket.on("confirm-leave-and-join", () => {
    if (!pendingJoin) return;
    const { roomId, name } = pendingJoin;
    pendingJoin = null;
    // If owner, close old room
    if (joinedRoom && roomOwners.get(joinedRoom) === socket.id) {
      const oldRoom = joinedRoom;
      io.to(oldRoom).emit("room-closed", "Room closed: owner left.");
      rooms.delete(oldRoom);
      roomOwners.delete(oldRoom);
      socketRoom.delete(socket.id);
      socket.leave(oldRoom);
      joinedRoom = null;
    }
    doJoin(roomId, name);
  });

  socket.on("cancel-join", () => { pendingJoin = null; });

  socket.on("leave-room", () => {
    if (!joinedRoom) return;
    const roomId = joinedRoom;
    const isOwner = roomOwners.get(roomId) === socket.id;
    joinedRoom = null;
    socket.leave(roomId);
    msgRates.delete(socket.id);
    if (isOwner) {
      io.to(roomId).emit("room-closed", "Room closed: owner left.");
      rooms.delete(roomId);
      roomOwners.delete(roomId);
      socketRoom.delete(socket.id);
    } else {
      removeUserFromRoom(socket.id);
      io.to(roomId).emit("room-users", rooms.get(roomId) ?? []);
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

  socket.on("call-rejected", (data) => {
    if (typeof data !== "object" || !data) return;
    const { target } = data;
    if (typeof target !== "string") return;
    socket.to(target).emit("call-rejected");
  });

  socket.on("kick-user", (data) => {
    if (!joinedRoom || typeof data !== "object" || !data) return;
    const { target } = data;
    if (typeof target !== "string") return;
    // Only room owner can kick
    if (roomOwners.get(joinedRoom) !== socket.id) return;
    // Can't kick yourself
    if (target === socket.id) return;
    // Target must be in the same room
    const roomUsers = rooms.get(joinedRoom) ?? [];
    if (!roomUsers.some(u => u.id === target)) return;
    // Notify the kicked user
    io.to(target).emit("kicked", "You were removed from the room by the host.");
  });

  socket.on("disconnect", () => {
    msgRates.delete(socket.id);
    // Mark offline instead of removing — room persists until owner explicitly leaves
    const roomId = markUserOffline(socket.id);
    if (roomId) {
      io.to(roomId).emit("room-users", rooms.get(roomId) ?? []);
    }
  });
});

process.on("SIGTERM", () => io.close(() => httpServer.close(() => process.exit(0))));
process.on("SIGINT",  () => io.close(() => httpServer.close(() => process.exit(0))));

httpServer.listen(PORT, () => {
  console.log(`🚀 Socket.IO → port ${PORT} | allowed origin: ${ALLOWED_ORIGIN}`);
});

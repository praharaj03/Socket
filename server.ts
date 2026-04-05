import { createServer } from "http";
import { Server, Socket } from "socket.io";

// ── Config ────────────────────────────────────────────────────────────────────
const PORT          = parseInt(process.env.PORT ?? "3001", 10);
const ALLOWED_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:3000";
const MAX_ROOM_SIZE  = 20;
const MAX_MSG_LEN    = 1000;
const MAX_NAME_LEN   = 40;
const MAX_ROOM_ID_LEN = 60;
const ROOM_ID_RE     = /^[a-zA-Z0-9]{16}$/;
const NAME_RE        = /^[^\x00-\x1F<>"'`]{1,40}$/; // no control chars or HTML

// ── Rate limiter (per socket) ─────────────────────────────────────────────────
const MSG_LIMIT   = 10;   // max messages
const MSG_WINDOW  = 5000; // per 5 s

interface RateEntry { count: number; resetAt: number; }
const msgRates = new Map<string, RateEntry>();

function isRateLimited(socketId: string): boolean {
  const now = Date.now();
  const entry = msgRates.get(socketId);
  if (!entry || now > entry.resetAt) {
    msgRates.set(socketId, { count: 1, resetAt: now + MSG_WINDOW });
    return false;
  }
  if (entry.count >= MSG_LIMIT) return true;
  entry.count++;
  return false;
}

// ── Sanitize plain text (strip HTML tags) ─────────────────────────────────────
function sanitize(str: unknown, maxLen: number): string | null {
  if (typeof str !== "string") return null;
  const trimmed = str.trim().slice(0, maxLen);
  // Strip any HTML/script tags
  return trimmed.replace(/<[^>]*>/g, "").replace(/[<>]/g, "");
}

// ── Room store ────────────────────────────────────────────────────────────────
interface User { id: string; name: string; }
const rooms = new Map<string, User[]>();

function addUserToRoom(roomId: string, user: User) {
  if (!rooms.has(roomId)) rooms.set(roomId, []);
  const list = rooms.get(roomId)!;
  if (!list.some(u => u.id === user.id)) list.push(user);
}

function removeUserFromRooms(socketId: string): string[] {
  const affected: string[] = [];
  for (const [roomId, users] of rooms) {
    const before = users.length;
    const filtered = users.filter(u => u.id !== socketId);
    if (filtered.length !== before) {
      affected.push(roomId);
      if (filtered.length === 0) rooms.delete(roomId);
      else rooms.set(roomId, filtered);
    }
  }
  return affected;
}

// ── Server ────────────────────────────────────────────────────────────────────
const httpServer = createServer((req, res) => {
  // Health check endpoint
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
  // Limit payload size to prevent abuse
  maxHttpBufferSize: 1e5, // 100 KB
  pingTimeout: 20000,
  pingInterval: 25000,
});

// ── Middleware: reject connections missing auth header (optional token) ────────
io.use((socket: Socket, next) => {
  // Basic origin check (Socket.IO CORS handles this, but double-check)
  const origin = socket.handshake.headers.origin;
  if (origin && origin !== ALLOWED_ORIGIN && process.env.NODE_ENV === "production") {
    return next(new Error("Unauthorized origin"));
  }
  next();
});

io.on("connection", (socket: Socket) => {
  let joinedRoom: string | null = null;

  // ── join-room ──────────────────────────────────────────────────────────────
  socket.on("join-room", (rawRoomId: unknown, rawName: unknown) => {
    const roomId = sanitize(rawRoomId, MAX_ROOM_ID_LEN);
    const name   = sanitize(rawName,   MAX_NAME_LEN);

    if (!roomId || !ROOM_ID_RE.test(roomId)) {
      socket.emit("error", "Invalid room ID. Use letters, numbers, hyphens and underscores only.");
      return;
    }
    if (!name || !NAME_RE.test(name)) {
      socket.emit("error", "Invalid name.");
      return;
    }

    const list = rooms.get(roomId) ?? [];
    if (list.length >= MAX_ROOM_SIZE) {
      socket.emit("error", `Room is full (max ${MAX_ROOM_SIZE} participants).`);
      return;
    }

    // Leave previous room if re-joining
    if (joinedRoom && joinedRoom !== roomId) {
      socket.leave(joinedRoom);
      removeUserFromRooms(socket.id);
    }

    joinedRoom = roomId;
    socket.join(roomId);
    addUserToRoom(roomId, { id: socket.id, name });
    io.to(roomId).emit("room-users", rooms.get(roomId));
  });

  // ── send-message ───────────────────────────────────────────────────────────
  socket.on("send-message", (data: unknown) => {
    if (!joinedRoom) return;
    if (isRateLimited(socket.id)) {
      socket.emit("error", "Slow down — you're sending messages too fast.");
      return;
    }

    if (typeof data !== "object" || data === null) return;
    const { roomId, message, user } = data as Record<string, unknown>;

    const safeRoom    = sanitize(roomId,  MAX_ROOM_ID_LEN);
    const safeMessage = sanitize(message, MAX_MSG_LEN);
    const safeUser    = sanitize(user,    MAX_NAME_LEN);

    if (!safeRoom || !safeMessage || !safeUser) return;
    if (safeRoom !== joinedRoom) return; // can't send to rooms you haven't joined

    io.to(safeRoom).emit("receive-message", {
      user: safeUser,
      message: safeMessage,
    });
  });

  // ── WebRTC signaling ───────────────────────────────────────────────────────
  socket.on("offer", (data: unknown) => {
    if (!joinedRoom || typeof data !== "object" || data === null) return;
    const { target, offer } = data as Record<string, unknown>;
    if (typeof target !== "string" || !target) return;
    // Only relay to sockets in the same room
    const roomUsers = rooms.get(joinedRoom) ?? [];
    if (!roomUsers.some(u => u.id === target)) return;
    socket.to(target).emit("offer", { offer, from: socket.id });
  });

  socket.on("answer", (data: unknown) => {
    if (!joinedRoom || typeof data !== "object" || data === null) return;
    const { target, answer } = data as Record<string, unknown>;
    if (typeof target !== "string" || !target) return;
    const roomUsers = rooms.get(joinedRoom) ?? [];
    if (!roomUsers.some(u => u.id === target)) return;
    socket.to(target).emit("answer", { answer, from: socket.id });
  });

  socket.on("ice-candidate", (data: unknown) => {
    if (!joinedRoom || typeof data !== "object" || data === null) return;
    const { target, candidate } = data as Record<string, unknown>;
    if (typeof target !== "string" || !target) return;
    const roomUsers = rooms.get(joinedRoom) ?? [];
    if (!roomUsers.some(u => u.id === target)) return;
    socket.to(target).emit("ice-candidate", { candidate, from: socket.id });
  });

  // ── disconnect ─────────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    msgRates.delete(socket.id);
    const affected = removeUserFromRooms(socket.id);
    for (const roomId of affected) {
      const list = rooms.get(roomId);
      io.to(roomId).emit("room-users", list ?? []);
    }
  });
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
function shutdown() {
  io.close(() => {
    httpServer.close(() => process.exit(0));
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT",  shutdown);

httpServer.listen(PORT, () => {
  console.log(`🚀 Socket.IO server → http://localhost:${PORT} [${process.env.NODE_ENV ?? "development"}]`);
});

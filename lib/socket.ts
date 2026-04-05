import { io } from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:3001";

const socket = io(SOCKET_URL, {
  autoConnect: false,          // connect explicitly after joining a room
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 2000,
  reconnectionDelayMax: 10000,
  timeout: 10000,
  transports: ["websocket"],   // skip long-polling — faster & more secure
  withCredentials: true,
});

export default socket;

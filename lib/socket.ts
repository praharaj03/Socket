import { io } from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? "https://socket-production-7f1b.up.railway.app";

const socket = io(SOCKET_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 2000,
  reconnectionDelayMax: 10000,
  timeout: 10000,
  transports: ["polling", "websocket"], // polling first so Railway proxy can upgrade
  withCredentials: true,
});

export default socket;

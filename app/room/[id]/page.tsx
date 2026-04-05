"use client";

import { useEffect, useRef, useState } from "react";
import socket from "@/lib/socket";
import { useParams, useSearchParams, useRouter } from "next/navigation";

type Message = { user: string; message: string };
type User    = { id: string; name: string };

const ROOM_ID_RE  = /^[a-zA-Z0-9]{16}$/;
const MAX_MSG_LEN = 1000;

const ICE: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

// Escape HTML to prevent XSS when rendering user content
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export default function Room() {
  const router       = useRouter();
  const { id }       = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const rawName      = searchParams.get("name") ?? "";

  // Validate room ID and name on mount — redirect if invalid
  const name = rawName.slice(0, 40).replace(/<[^>]*>/g, "") || "Anonymous";

  const [message,  setMessage]  = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [users,    setUsers]    = useState<User[]>([]);
  const [inCall,   setInCall]   = useState(false);
  const [muted,    setMuted]    = useState(false);
  const [connErr,  setConnErr]  = useState("");

  const peers        = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStream  = useRef<MediaStream | null>(null);
  const remoteAudios = useRef<Map<string, HTMLAudioElement>>(new Map());
  const messagesEnd  = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);

  // Validate room ID before doing anything
  useEffect(() => {
    if (!ROOM_ID_RE.test(id)) {
      router.replace("/");
    }
  }, [id, router]);

  /* ── WebRTC ── */
  const createPeer = (targetId: string) => {
    const pc = new RTCPeerConnection(ICE);
    peers.current.set(targetId, pc);
    localStream.current?.getTracks().forEach(t => pc.addTrack(t, localStream.current!));
    pc.ontrack = e => {
      let a = remoteAudios.current.get(targetId);
      if (!a) { a = new Audio(); a.autoplay = true; remoteAudios.current.set(targetId, a); }
      a.srcObject = e.streams[0];
    };
    pc.onicecandidate = e => {
      if (e.candidate) socket.emit("ice-candidate", { target: targetId, candidate: e.candidate });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") closePeer(targetId);
    };
    return pc;
  };

  const closePeer = (targetId: string) => {
    peers.current.get(targetId)?.close();
    peers.current.delete(targetId);
    const a = remoteAudios.current.get(targetId);
    if (a) { a.srcObject = null; remoteAudios.current.delete(targetId); }
  };

  const startCall = async (targetId: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStream.current = stream;
      setInCall(true);
      const pc    = createPeer(targetId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("offer", { target: targetId, offer });
    } catch {
      setConnErr("Microphone access denied.");
    }
  };

  const endCall = () => {
    localStream.current?.getTracks().forEach(t => t.stop());
    localStream.current = null;
    peers.current.forEach((_, pid) => closePeer(pid));
    setInCall(false);
    setMuted(false);
  };

  const toggleMute = () => {
    localStream.current?.getAudioTracks().forEach(t => { t.enabled = muted; });
    setMuted(m => !m);
  };

  /* ── Socket ── */
  useEffect(() => {
    if (!ROOM_ID_RE.test(id)) return;

    // Connect explicitly (autoConnect: false in socket.ts)
    if (!socket.connected) socket.connect();

    socket.emit("join-room", id, name);

    socket.on("error", (msg: string) => setConnErr(msg));

    socket.on("receive-message", (d: Message) => {
      // Sanitize incoming data before storing
      setMessages(p => [...p, {
        user:    escapeHtml(String(d.user    ?? "").slice(0, 40)),
        message: escapeHtml(String(d.message ?? "").slice(0, 1000)),
      }]);
    });

    socket.on("room-users", (list: User[]) => {
      if (!Array.isArray(list)) return;
      setUsers(list.map(u => ({
        id:   String(u.id   ?? "").slice(0, 40),
        name: escapeHtml(String(u.name ?? "").slice(0, 40)),
      })));
    });

    socket.on("offer", async (d: { offer: RTCSessionDescriptionInit; from: string }) => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStream.current = stream;
        setInCall(true);
        const pc = createPeer(d.from);
        await pc.setRemoteDescription(new RTCSessionDescription(d.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("answer", { target: d.from, answer });
      } catch { /* user denied mic */ }
    });

    socket.on("answer", async (d: { answer: RTCSessionDescriptionInit; from: string }) => {
      const pc = peers.current.get(d.from);
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(d.answer));
    });

    socket.on("ice-candidate", async (d: { candidate: RTCIceCandidateInit; from: string }) => {
      const pc = peers.current.get(d.from);
      if (pc && d.candidate) {
        try { await pc.addIceCandidate(new RTCIceCandidate(d.candidate)); } catch { /* ignore */ }
      }
    });

    socket.on("disconnect", () => setConnErr("Disconnected. Reconnecting…"));
    socket.on("connect",    () => { setConnErr(""); socket.emit("join-room", id, name); });

    return () => {
      socket.off("error");
      socket.off("receive-message");
      socket.off("room-users");
      socket.off("offer");
      socket.off("answer");
      socket.off("ice-candidate");
      socket.off("disconnect");
      socket.off("connect");
      endCall();
      socket.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, name]);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = () => {
    const trimmed = message.trim().slice(0, MAX_MSG_LEN);
    if (!trimmed) return;
    socket.emit("send-message", { roomId: id, message: trimmed, user: name });
    setMessage("");
    inputRef.current?.focus();
  };

  const [copied, setCopied] = useState(false);

  const copyRoomId = () => {
    navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const av = (n: string) => n.charAt(0).toUpperCase();

  return (
    <div style={{ display: "flex", height: "100vh", background: "#111b21", fontFamily: "'Segoe UI', sans-serif", overflow: "hidden" }}>

      {/* ── Sidebar ── */}
      <div style={{ width: 260, flexShrink: 0, background: "#202c33", borderRight: "1px solid #2a3942", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #2a3942", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 24 }}>💬</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "#e9edef", fontWeight: 700, fontSize: 14 }}>Vaartalav</div>
            <div style={{ color: "#00a884", fontSize: 10, fontFamily: "monospace", letterSpacing: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{id}</div>
          </div>
          <button
            onClick={copyRoomId}
            title="Copy Room ID"
            style={{
              background: copied ? "#00a884" : "#2a3942",
              border: "none", borderRadius: 6, cursor: "pointer",
              color: "#fff", fontSize: 11, fontWeight: 700,
              padding: "5px 8px", flexShrink: 0,
              transition: "background 0.2s",
              whiteSpace: "nowrap",
            }}
          >
            {copied ? "✓ Copied" : "Copy ID"}
          </button>
        </div>

        {/* Me */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #2a3942", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={avStyle("#00a884")}>{av(name)}</div>
          <div>
            <div style={{ color: "#e9edef", fontSize: 13, fontWeight: 600 }}>{name}</div>
            <div style={{ color: "#8696a0", fontSize: 11 }}>You</div>
          </div>
        </div>

        {/* Participants */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          <div style={{ color: "#8696a0", fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: "6px 16px 8px", textTransform: "uppercase" }}>
            Participants ({users.length})
          </div>
          {users.map(u => (
            <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 16px" }}>
              <div style={avStyle(u.id === socket.id ? "#00a884" : "#2a3942")}>{av(u.name)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "#e9edef", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {u.name}{u.id === socket.id && <span style={{ color: "#8696a0", fontSize: 10, marginLeft: 4 }}>(you)</span>}
                </div>
              </div>
              {u.id !== socket.id && !inCall && (
                <button
                  onClick={() => startCall(u.id)}
                  title="Voice call"
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#00a884" }}
                >
                  📞
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Call controls */}
        {inCall && (
          <div style={{ padding: "12px 16px", borderTop: "1px solid #2a3942", background: "rgba(0,168,132,0.08)", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ color: "#00a884", fontSize: 11, fontWeight: 700 }}>🎙 CALL ACTIVE</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={toggleMute} style={callBtn(muted ? "#00a884" : "#2a3942")}>
                {muted ? "UNMUTE" : "MUTE"}
              </button>
              <button onClick={endCall} style={callBtn("#c0392b")}>END</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Chat ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Chat header */}
        <div style={{ height: 54, padding: "0 20px", background: "#202c33", borderBottom: "1px solid #2a3942", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: "#e9edef", fontWeight: 700, fontSize: 15 }}>Room Chat</span>
            <span style={{ background: "#2a3942", color: "#8696a0", fontSize: 11, padding: "2px 8px", borderRadius: 10 }}>
              {users.length} online
            </span>
          </div>
          <div style={{ color: "#8696a0", fontSize: 11 }}>#{id}</div>
        </div>

        {/* Error banner */}
        {connErr && (
          <div style={{ background: "#c0392b", color: "#fff", fontSize: 12, padding: "8px 20px", textAlign: "center" }}>
            ⚠ {connErr}
          </div>
        )}

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", background: "#0b141a", display: "flex", flexDirection: "column", gap: 6 }}>
          {messages.length === 0 && (
            <div style={{ textAlign: "center", color: "#3d5a65", marginTop: 80, fontSize: 13 }}>
              No messages yet. Say hello! 👋
            </div>
          )}
          {messages.map((msg, i) => {
            const isMe = msg.user === escapeHtml(name);
            return (
              <div key={i} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "68%",
                  background: isMe ? "#005c4b" : "#202c33",
                  borderRadius: isMe ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                  padding: "8px 12px",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
                }}>
                  {!isMe && (
                    <div style={{ color: "#00a884", fontSize: 11, fontWeight: 700, marginBottom: 2 }}>
                      {msg.user}
                    </div>
                  )}
                  {/* dangerouslySetInnerHTML avoided — content is already escaped */}
                  <div style={{ color: "#e9edef", fontSize: 14, lineHeight: 1.45, wordBreak: "break-word" }}>
                    {msg.message}
                  </div>
                  <div style={{ color: "#8696a0", fontSize: 10, textAlign: "right", marginTop: 2 }}>
                    {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    {isMe && <span style={{ marginLeft: 4, color: "#00a884" }}>✓✓</span>}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEnd} />
        </div>

        {/* Input */}
        <div style={{ padding: "10px 16px", background: "#202c33", borderTop: "1px solid #2a3942", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <input
            ref={inputRef}
            value={message}
            onChange={e => setMessage(e.target.value.slice(0, MAX_MSG_LEN))}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
            placeholder="Type a message"
            maxLength={MAX_MSG_LEN}
            autoComplete="off"
            spellCheck
            style={{
              flex: 1, padding: "11px 16px",
              background: "#2a3942", border: "none", borderRadius: 24,
              color: "#e9edef", fontSize: 14, outline: "none", fontFamily: "inherit",
            }}
          />
          <button
            onClick={sendMessage}
            disabled={!message.trim()}
            aria-label="Send message"
            style={{
              width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
              background: message.trim() ? "#00a884" : "#2a3942",
              border: "none", cursor: message.trim() ? "pointer" : "not-allowed",
              fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 0.2s",
            }}
          >
            ➤
          </button>
        </div>
      </div>
    </div>
  );
}

const avStyle = (bg: string): React.CSSProperties => ({
  width: 36, height: 36, borderRadius: "50%", background: bg,
  display: "flex", alignItems: "center", justifyContent: "center",
  color: "#fff", fontWeight: 700, fontSize: 14, flexShrink: 0,
});

const callBtn = (bg: string): React.CSSProperties => ({
  flex: 1, padding: "7px 0", background: bg, border: "none",
  color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", borderRadius: 6,
});

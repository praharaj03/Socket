"use client";

import { useEffect, useRef, useState } from "react";
import socket from "@/lib/socket";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";

type Message = { user: string; message: string; ts: string };
type User    = { id: string; name: string };

const ROOM_ID_RE  = /^[a-zA-Z0-9]{16}$/;
const MAX_MSG_LEN = 1000;

const ICE: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

function escapeHtml(str: string): string {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#x27;");
}

function now() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Room() {
  const router       = useRouter();
  const { id }       = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const name         = (searchParams.get("name") ?? "").slice(0, 40).replace(/<[^>]*>/g, "") || "Anonymous";

  const [message,  setMessage]  = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [users,    setUsers]    = useState<User[]>([]);
  const [inCall,   setInCall]   = useState(false);
  const [muted,    setMuted]    = useState(false);
  const [connErr,  setConnErr]  = useState("");
  const [copied,   setCopied]   = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const peers        = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStream  = useRef<MediaStream | null>(null);
  const remoteAudios = useRef<Map<string, HTMLAudioElement>>(new Map());
  const messagesEnd  = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!ROOM_ID_RE.test(id)) router.replace("/"); }, [id, router]);

  const createPeer = (targetId: string) => {
    const pc = new RTCPeerConnection(ICE);
    peers.current.set(targetId, pc);
    localStream.current?.getTracks().forEach(t => pc.addTrack(t, localStream.current!));
    pc.ontrack = e => {
      let a = remoteAudios.current.get(targetId);
      if (!a) { a = new Audio(); a.autoplay = true; remoteAudios.current.set(targetId, a); }
      a.srcObject = e.streams[0];
    };
    pc.onicecandidate = e => { if (e.candidate) socket.emit("ice-candidate", { target: targetId, candidate: e.candidate }); };
    pc.onconnectionstatechange = () => { if (pc.connectionState === "failed") closePeer(targetId); };
    return pc;
  };

  const closePeer = (targetId: string) => {
    peers.current.get(targetId)?.close(); peers.current.delete(targetId);
    const a = remoteAudios.current.get(targetId);
    if (a) { a.srcObject = null; remoteAudios.current.delete(targetId); }
  };

  const startCall = async (targetId: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStream.current = stream; setInCall(true);
      const pc = createPeer(targetId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("offer", { target: targetId, offer });
    } catch { setConnErr("MIC ACCESS DENIED"); }
  };

  const endCall = () => {
    localStream.current?.getTracks().forEach(t => t.stop());
    localStream.current = null;
    peers.current.forEach((_, pid) => closePeer(pid));
    setInCall(false); setMuted(false);
  };

  const toggleMute = () => {
    localStream.current?.getAudioTracks().forEach(t => { t.enabled = muted; });
    setMuted(m => !m);
  };

  useEffect(() => {
    if (!ROOM_ID_RE.test(id)) return;
    if (!socket.connected) socket.connect();
    socket.emit("join-room", id, name);

    socket.on("error",           (msg: string) => setConnErr(msg));
    socket.on("receive-message", (d: { user: string; message: string }) =>
      setMessages(p => [...p, { user: escapeHtml(String(d.user ?? "").slice(0,40)), message: escapeHtml(String(d.message ?? "").slice(0,1000)), ts: now() }])
    );
    socket.on("room-users", (list: User[]) => {
      if (!Array.isArray(list)) return;
      setUsers(list.map(u => ({ id: String(u.id ?? "").slice(0,40), name: escapeHtml(String(u.name ?? "").slice(0,40)) })));
    });
    socket.on("offer", async (d: { offer: RTCSessionDescriptionInit; from: string }) => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStream.current = stream; setInCall(true);
        const pc = createPeer(d.from);
        await pc.setRemoteDescription(new RTCSessionDescription(d.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("answer", { target: d.from, answer });
      } catch { /* mic denied */ }
    });
    socket.on("answer", async (d: { answer: RTCSessionDescriptionInit; from: string }) => {
      const pc = peers.current.get(d.from);
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(d.answer));
    });
    socket.on("ice-candidate", async (d: { candidate: RTCIceCandidateInit; from: string }) => {
      const pc = peers.current.get(d.from);
      if (pc && d.candidate) try { await pc.addIceCandidate(new RTCIceCandidate(d.candidate)); } catch { /* ignore */ }
    });
    socket.on("disconnect", () => setConnErr("CONNECTION LOST — RECONNECTING..."));
    socket.on("connect",    () => { setConnErr(""); socket.emit("join-room", id, name); });
    socket.on("room-closed", (msg: string) => { alert(msg); router.replace("/"); });

    return () => {
      ["error","receive-message","room-users","offer","answer","ice-candidate","disconnect","connect","room-closed"]
        .forEach(e => socket.off(e));
      endCall(); socket.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, name]);

  useEffect(() => { messagesEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const sendMessage = () => {
    const trimmed = message.trim().slice(0, MAX_MSG_LEN);
    if (!trimmed) return;
    socket.emit("send-message", { roomId: id, message: trimmed, user: name });
    setMessage(""); inputRef.current?.focus();
  };

  const leaveRoom = () => {
    socket.emit("leave-room");
    endCall();
    socket.disconnect();
    router.replace("/");
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(id);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const av = (n: string) => n.charAt(0).toUpperCase();

  return (
    <div style={{ display: "flex", height: "100vh", background: "#0a0a0a", fontFamily: "'Segoe UI', sans-serif", overflow: "hidden", position: "relative" }}>

      {/* Hex grid */}
      <div className="hex-bg" />
      {/* Scan line */}
      <div className="scan-line" />

      {/* Sidebar overlay for mobile */}
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      {/* ── SIDEBAR ── */}
      <div className={`room-sidebar${sidebarOpen ? " open" : ""}`} style={{ width: 260, flexShrink: 0, background: "#0f0f0f", borderRight: "1px solid rgba(255,0,51,0.2)", display: "flex", flexDirection: "column", position: "relative", zIndex: 10 }}>

        {/* Sidebar header */}
        <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,0,51,0.15)", background: "#0a0a0a" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <Image src="/logo.png" alt="Vaartalav" width={32} height={32} style={{ width: 32, height: "auto", filter: "drop-shadow(0 0 8px rgba(255,0,51,0.8))" }} />
            <div>
              <div style={{ color: "#ff0033", fontWeight: 900, fontSize: 13, letterSpacing: 3, fontFamily: "monospace" }}>VAARTALAV</div>
              <div style={{ color: "#333", fontSize: 9, letterSpacing: 2, textTransform: "uppercase" }}>Combat Chat</div>
            </div>
          </div>
          {/* Room ID row */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#141414", border: "1px solid rgba(255,0,51,0.15)", padding: "6px 10px" }}>
            <span style={{ color: "#333", fontSize: 9, letterSpacing: 1, textTransform: "uppercase", flexShrink: 0 }}>ROOM</span>
            <span style={{ color: "#ff0033", fontSize: 10, fontFamily: "monospace", letterSpacing: 1, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{id}</span>
            <button
              onClick={copyRoomId}
              style={{
                background: copied ? "rgba(255,0,51,0.3)" : "rgba(255,0,51,0.1)",
                border: "1px solid rgba(255,0,51,0.3)", color: copied ? "#fff" : "#ff0033",
                fontSize: 9, fontWeight: 700, padding: "3px 7px", cursor: "pointer",
                letterSpacing: 1, fontFamily: "monospace", flexShrink: 0,
                transition: "all 0.2s",
              }}
            >
              {copied ? "✓ OK" : "COPY"}
            </button>
          </div>
        </div>

        {/* Me */}
        <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(255,0,51,0.1)", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={avStyle("#ff0033")}>{av(name)}</div>
          <div>
            <div style={{ color: "#f0f0f0", fontSize: 13, fontWeight: 700 }}>{name}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span className="blink" style={{ width: 5, height: 5, borderRadius: "50%", background: "#ff0033", display: "inline-block" }} />
              <span style={{ color: "#ff0033", fontSize: 9, letterSpacing: 1, textTransform: "uppercase" }}>Online</span>
            </div>
          </div>
        </div>

        {/* Participants */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          <div style={{ color: "#ff0033", fontSize: 9, fontWeight: 700, letterSpacing: 2, padding: "6px 16px 8px", textTransform: "uppercase", fontFamily: "monospace" }}>
            ▶ Players ({users.length})
          </div>
          {users.map(u => (
            <div key={u.id} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "8px 16px",
              borderLeft: u.id === socket.id ? "2px solid #ff0033" : "2px solid transparent",
              background: u.id === socket.id ? "rgba(255,0,51,0.05)" : "transparent",
              transition: "background 0.2s",
            }}>
              <div style={avStyle(u.id === socket.id ? "#ff0033" : "#1a1a1a")}>{av(u.name)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "#f0f0f0", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {u.name}
                  {u.id === socket.id && <span style={{ color: "#333", fontSize: 9, marginLeft: 4 }}>[YOU]</span>}
                </div>
              </div>
              {u.id !== socket.id && !inCall && (
                <button
                  onClick={() => startCall(u.id)}
                  title="Voice call"
                  style={{ background: "rgba(255,0,51,0.1)", border: "1px solid rgba(255,0,51,0.3)", color: "#ff0033", width: 26, height: 26, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                >
                  ☎
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Call controls */}
        {inCall && (
          <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,0,51,0.2)", background: "rgba(255,0,51,0.06)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <span className="blink" style={{ width: 6, height: 6, borderRadius: "50%", background: "#ff0033", display: "inline-block" }} />
              <span style={{ color: "#ff0033", fontSize: 10, fontWeight: 700, letterSpacing: 2, fontFamily: "monospace" }}>VOICE ACTIVE</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={toggleMute} className="rog-btn" style={callBtnStyle(muted ? "#ff0033" : "#1a1a1a")}>
                {muted ? "UNMUTE" : "MUTE"}
              </button>
              <button onClick={endCall} className="rog-btn" style={callBtnStyle("#ff0033")}>END</button>
            </div>
          </div>
        )}
      </div>

      {/* ── CHAT AREA ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative", zIndex: 10 }}>

        {/* Chat header */}
        <div style={{ height: 54, padding: "0 12px 0 16px", background: "#0f0f0f", borderBottom: "1px solid rgba(255,0,51,0.15)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button className="sidebar-toggle" onClick={() => setSidebarOpen(o => !o)}>☰</button>
            <div style={{ width: 8, height: 8, background: "#ff0033", boxShadow: "0 0 8px #ff0033" }} className="blink" />
            <span style={{ color: "#f0f0f0", fontWeight: 700, fontSize: 14, letterSpacing: 2, textTransform: "uppercase", fontFamily: "monospace" }}>
              COMBAT CHAT
            </span>
            <span style={{ background: "rgba(255,0,51,0.1)", border: "1px solid rgba(255,0,51,0.25)", color: "#ff0033", fontSize: 9, fontWeight: 700, padding: "2px 8px", letterSpacing: 1, fontFamily: "monospace" }}>
              {users.length} ONLINE
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ color: "#222", fontSize: 10, fontFamily: "monospace", letterSpacing: 1 }}>#{id.slice(0,8)}...</div>
            <button
              onClick={leaveRoom}
              className="rog-btn"
              title="Leave Room"
              style={{
                background: "rgba(255,0,51,0.1)",
                border: "1px solid rgba(255,0,51,0.35)",
                color: "#ff0033", fontSize: 10, fontWeight: 700,
                padding: "5px 12px", cursor: "pointer",
                letterSpacing: 1, fontFamily: "monospace",
                textTransform: "uppercase",
              }}
            >
              ✕ LEAVE
            </button>
          </div>
        </div>

        {/* Error banner */}
        {connErr && (
          <div style={{ background: "rgba(255,0,51,0.15)", borderBottom: "1px solid rgba(255,0,51,0.3)", color: "#ff0033", fontSize: 11, padding: "8px 20px", textAlign: "center", letterSpacing: 1, fontFamily: "monospace" }}>
            ⚠ {connErr}
          </div>
        )}

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", background: "#0a0a0a", display: "flex", flexDirection: "column", gap: 8 }}>
          {messages.length === 0 && (
            <div style={{ textAlign: "center", color: "#1a1a1a", marginTop: 80, fontSize: 12, letterSpacing: 3, textTransform: "uppercase", fontFamily: "monospace" }}>
              ▶ NO TRANSMISSIONS YET
            </div>
          )}
          {messages.map((msg, i) => {
            const isMe = msg.user === escapeHtml(name);
            return (
              <div key={i} className="msg-in" style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "68%",
                  background: isMe ? "rgba(255,0,51,0.12)" : "#141414",
                  border: isMe ? "1px solid rgba(255,0,51,0.35)" : "1px solid #1f1f1f",
                  padding: "9px 13px",
                  clipPath: isMe
                    ? "polygon(0 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%)"
                    : "polygon(0 0, 100% 0, 100% 100%, 8px 100%, 0 calc(100% - 8px))",
                  boxShadow: isMe ? "0 0 12px rgba(255,0,51,0.15)" : "none",
                }}>
                  {!isMe && (
                    <div style={{ color: "#ff0033", fontSize: 10, fontWeight: 700, marginBottom: 3, letterSpacing: 1, fontFamily: "monospace" }}>
                      ▶ {msg.user}
                    </div>
                  )}
                  <div style={{ color: "#e0e0e0", fontSize: 13.5, lineHeight: 1.5, wordBreak: "break-word" }}>
                    {msg.message}
                  </div>
                  <div style={{ color: "#333", fontSize: 9, textAlign: "right", marginTop: 4, fontFamily: "monospace", letterSpacing: 0.5 }}>
                    {msg.ts}
                    {isMe && <span style={{ marginLeft: 6, color: "#ff0033" }}>✓✓</span>}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEnd} />
        </div>

        {/* Input bar */}
        <div style={{ padding: "10px 16px", background: "#0f0f0f", borderTop: "1px solid rgba(255,0,51,0.15)", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <input
            ref={inputRef}
            value={message}
            onChange={e => setMessage(e.target.value.slice(0, MAX_MSG_LEN))}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
            placeholder="TRANSMIT MESSAGE..."
            maxLength={MAX_MSG_LEN}
            autoComplete="off"
            className="rog-input"
            style={{
              flex: 1, padding: "11px 16px",
              background: "#0a0a0a", border: "1px solid rgba(255,0,51,0.2)",
              color: "#f0f0f0", fontSize: 13, outline: "none",
              fontFamily: "inherit", letterSpacing: 0.3,
              transition: "border-color 0.2s, box-shadow 0.2s",
            }}
          />
          <button
            onClick={sendMessage}
            disabled={!message.trim()}
            className="rog-btn"
            aria-label="Send"
            style={{
              width: 44, height: 44, flexShrink: 0,
              background: message.trim() ? "linear-gradient(135deg,#ff0033,#cc0022)" : "#141414",
              border: "1px solid rgba(255,0,51,0.3)",
              color: "#fff", fontSize: 16,
              cursor: message.trim() ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: message.trim() ? "0 0 16px rgba(255,0,51,0.5)" : "none",
              transition: "all 0.2s",
              clipPath: "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))",
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
  width: 34, height: 34, background: bg, flexShrink: 0,
  display: "flex", alignItems: "center", justifyContent: "center",
  color: "#fff", fontWeight: 900, fontSize: 13, fontFamily: "monospace",
  clipPath: "polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))",
  boxShadow: bg === "#ff0033" ? "0 0 10px rgba(255,0,51,0.5)" : "none",
});

const callBtnStyle = (bg: string): React.CSSProperties => ({
  flex: 1, padding: "7px 0", background: bg,
  border: "1px solid rgba(255,0,51,0.4)",
  color: "#fff", fontSize: 10, fontWeight: 700,
  cursor: "pointer", letterSpacing: 2, fontFamily: "monospace",
  textTransform: "uppercase",
});

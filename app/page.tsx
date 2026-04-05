"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function generateRoomId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  for (const byte of array) id += chars[byte % chars.length];
  return id;
}

export default function Home() {
  const [tab, setTab] = useState<"create" | "join">("create");

  const [createName, setCreateName] = useState("");
  const [generatedId, setGeneratedId] = useState("");
  const [copied, setCopied] = useState(false);

  const [joinName, setJoinName] = useState("");
  const [joinId,   setJoinId]   = useState("");

  const [err, setErr] = useState("");
  const router = useRouter();

  const handleCreate = () => {
    if (!createName.trim()) { setErr("Enter your name"); return; }
    const roomId = generateRoomId();
    setGeneratedId(roomId);
    setErr("");
    router.push(`/room/${roomId}?name=${encodeURIComponent(createName.trim())}`);
  };

  const handleJoin = () => {
    if (!joinName.trim())   { setErr("Enter your name"); return; }
    if (!joinId.trim())     { setErr("Enter the room ID"); return; }
    if (joinId.trim().length !== 16) { setErr("Room ID must be 16 characters"); return; }
    router.push(`/room/${joinId.trim()}?name=${encodeURIComponent(joinName.trim())}`);
  };

  const copyId = () => {
    if (!generatedId) return;
    navigator.clipboard.writeText(generatedId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const switchTab = (t: "create" | "join") => { setTab(t); setErr(""); setGeneratedId(""); };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#111b21",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Segoe UI', sans-serif",
      padding: 16,
    }}>
      <div style={{ width: "100%", maxWidth: 380 }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 52, lineHeight: 1 }}>💬</div>
          <h1 style={{ color: "#e9edef", fontSize: 24, fontWeight: 700, margin: "10px 0 4px", letterSpacing: 1 }}>
            Vaartalav
          </h1>
          <p style={{ color: "#8696a0", fontSize: 13, margin: 0 }}>
            Real-time chat &amp; voice rooms
          </p>
        </div>

        {/* Card */}
        <div style={{ background: "#202c33", borderRadius: 12, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,0.5)" }}>

          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid #2a3942" }}>
            {(["create", "join"] as const).map((t) => (
              <button
                key={t}
                onClick={() => switchTab(t)}
                style={{
                  flex: 1,
                  padding: "14px",
                  background: "none",
                  border: "none",
                  borderBottom: tab === t ? "2px solid #00a884" : "2px solid transparent",
                  color: tab === t ? "#00a884" : "#8696a0",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: "pointer",
                  letterSpacing: 0.3,
                  transition: "color 0.2s",
                }}
              >
                {t === "create" ? "➕ Create Room" : "🔗 Join Room"}
              </button>
            ))}
          </div>

          {/* Form */}
          <div style={{ padding: "28px 28px 24px" }}>
            {tab === "create" ? (
              <>
                <p style={{ color: "#8696a0", fontSize: 12, marginBottom: 20, marginTop: 0 }}>
                  A unique 16-character Room ID will be generated for you. Share it with others to invite them.
                </p>
                <label style={labelStyle}>YOUR NAME</label>
                <input
                  placeholder="Enter your name"
                  value={createName}
                  onChange={e => { setCreateName(e.target.value); setErr(""); }}
                  onKeyDown={e => e.key === "Enter" && handleCreate()}
                  style={inputStyle}
                  autoFocus
                />
                {err && <div style={errStyle}>⚠ {err}</div>}
                <button onClick={handleCreate} style={btnStyle("#00a884")}>
                  Generate ID &amp; Enter Room →
                </button>
              </>
            ) : (
              <>
                <p style={{ color: "#8696a0", fontSize: 12, marginBottom: 20, marginTop: 0 }}>
                  Enter the 16-character Room ID shared by the room creator.
                </p>
                <label style={labelStyle}>YOUR NAME</label>
                <input
                  placeholder="Enter your name"
                  value={joinName}
                  onChange={e => { setJoinName(e.target.value); setErr(""); }}
                  onKeyDown={e => e.key === "Enter" && handleJoin()}
                  style={inputStyle}
                  autoFocus
                />
                <label style={{ ...labelStyle, marginTop: 14 }}>ROOM ID</label>
                <div style={{ position: "relative" }}>
                  <input
                    placeholder="Paste 16-character room ID"
                    value={joinId}
                    onChange={e => { setJoinId(e.target.value.trim()); setErr(""); }}
                    onKeyDown={e => e.key === "Enter" && handleJoin()}
                    maxLength={16}
                    style={{ ...inputStyle, fontFamily: "monospace", letterSpacing: 2 }}
                  />
                  <span style={{
                    position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                    color: joinId.length === 16 ? "#00a884" : "#8696a0",
                    fontSize: 11, fontWeight: 700,
                  }}>
                    {joinId.length}/16
                  </span>
                </div>
                {err && <div style={errStyle}>⚠ {err}</div>}
                <button onClick={handleJoin} style={btnStyle("#1d6fa4")}>
                  Join Room →
                </button>
              </>
            )}
          </div>
        </div>

        <p style={{ color: "#3d5a65", fontSize: 11, textAlign: "center", marginTop: 16 }}>
          No account needed · Powered by WebRTC
        </p>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 1,
  color: "#8696a0",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 14px",
  background: "#2a3942",
  border: "1px solid transparent",
  borderRadius: 8,
  color: "#e9edef",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

const errStyle: React.CSSProperties = {
  color: "#ef4444",
  fontSize: 12,
  marginTop: 10,
  marginBottom: 2,
};

const btnStyle = (bg: string): React.CSSProperties => ({
  width: "100%",
  marginTop: 20,
  padding: "13px",
  background: bg,
  color: "#fff",
  border: "none",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  letterSpacing: 0.3,
});

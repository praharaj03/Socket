"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

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
  const [joinName,   setJoinName]   = useState("");
  const [joinId,     setJoinId]     = useState("");
  const [err,        setErr]        = useState("");
  const router = useRouter();

  const handleCreate = () => {
    if (!createName.trim()) { setErr("ENTER YOUR CALLSIGN"); return; }
    const roomId = generateRoomId();
    router.push(`/room/${roomId}?name=${encodeURIComponent(createName.trim())}`);
  };

  const handleJoin = () => {
    if (!joinName.trim())          { setErr("ENTER YOUR CALLSIGN"); return; }
    if (!joinId.trim())            { setErr("ENTER ROOM CODE"); return; }
    if (joinId.trim().length !== 16) { setErr("ROOM CODE MUST BE 16 CHARACTERS"); return; }
    router.push(`/room/${joinId.trim()}?name=${encodeURIComponent(joinName.trim())}`);
  };

  const switchTab = (t: "create" | "join") => { setTab(t); setErr(""); };

  return (
    <div style={{ minHeight: "100vh", minHeight: "100dvh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, position: "relative", overflow: "hidden" }}>

      {/* Hex grid */}
      <div className="hex-bg" />

      {/* Scan line */}
      <div className="scan-line" />

      {/* Red bottom glow */}
      <div style={{ position: "fixed", bottom: -100, left: "50%", transform: "translateX(-50%)", width: 700, height: 300, background: "radial-gradient(ellipse, rgba(255,0,51,0.15) 0%, transparent 70%)", pointerEvents: "none", filter: "blur(20px)" }} />

      {/* Top corner accents */}
      <div style={{ position: "fixed", top: 0, left: 0, width: 120, height: 120, borderTop: "1px solid rgba(255,0,51,0.4)", borderLeft: "1px solid rgba(255,0,51,0.4)", pointerEvents: "none" }} />
      <div style={{ position: "fixed", top: 0, right: 0, width: 120, height: 120, borderTop: "1px solid rgba(255,0,51,0.4)", borderRight: "1px solid rgba(255,0,51,0.4)", pointerEvents: "none" }} />
      <div style={{ position: "fixed", bottom: 0, left: 0, width: 120, height: 120, borderBottom: "1px solid rgba(255,0,51,0.4)", borderLeft: "1px solid rgba(255,0,51,0.4)", pointerEvents: "none" }} />
      <div style={{ position: "fixed", bottom: 0, right: 0, width: 120, height: 120, borderBottom: "1px solid rgba(255,0,51,0.4)", borderRight: "1px solid rgba(255,0,51,0.4)", pointerEvents: "none" }} />

      <div className="flicker" style={{ width: "100%", maxWidth: 400, position: "relative", zIndex: 10 }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ lineHeight: 1 }}><Image src="/logo.png" alt="Vaartalav" width={80} height={80} loading="eager" priority style={{ width: 80, height: "auto", filter: "drop-shadow(0 0 16px rgba(255,0,51,0.8))" }} /></div>
          <h1
            className="glitch neon-text"
            data-text="VAARTALAV"
            style={{ color: "#ff0033", fontSize: 32, fontWeight: 900, margin: "12px 0 4px", letterSpacing: 6, fontFamily: "monospace" }}
          >
            VAARTALAV
          </h1>
          <div className="rgb-line" style={{ margin: "8px auto", width: 160 }} />
          <p style={{ color: "#555", fontSize: 11, letterSpacing: 3, marginTop: 8, textTransform: "uppercase" }}>
            Real-time · Chat · Voice
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: "linear-gradient(135deg, #0f0f0f 0%, #141414 100%)",
          border: "1px solid rgba(255,0,51,0.3)",
          position: "relative",
          clipPath: "polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 20px 100%, 0 calc(100% - 20px))",
          boxShadow: "0 0 40px rgba(255,0,51,0.1), inset 0 0 40px rgba(255,0,51,0.03)",
        }}>
          <div className="corner-tl" /><div className="corner-tr" />
          <div className="corner-bl" /><div className="corner-br" />

          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid rgba(255,0,51,0.2)" }}>
            {(["create", "join"] as const).map(t => (
              <button
                key={t}
                onClick={() => switchTab(t)}
                className="rog-btn"
                style={{
                  flex: 1, padding: "16px 14px", background: tab === t ? "rgba(255,0,51,0.08)" : "none",
                  border: "none", borderBottom: tab === t ? "2px solid #ff0033" : "2px solid transparent",
                  color: tab === t ? "#ff0033" : "#555",
                  fontWeight: 700, fontSize: 13, cursor: "pointer",
                  letterSpacing: 2, textTransform: "uppercase", fontFamily: "monospace",
                  transition: "all 0.2s",
                }}
              >
                {t === "create" ? "[ CREATE ]" : "[ JOIN ]"}
              </button>
            ))}
          </div>

          {/* Form */}
          <div style={{ padding: "28px 28px 24px" }}>
            <p style={{ color: "#444", fontSize: 11, marginBottom: 20, letterSpacing: 1, textTransform: "uppercase" }}>
              {tab === "create"
                ? "A unique 16-char room code will be generated"
                : "Enter the room code shared by the host"}
            </p>

            <label style={labelStyle}>CALLSIGN</label>
            <input
              placeholder={tab === "create" ? "Enter your name" : "Enter your name"}
              value={tab === "create" ? createName : joinName}
              onChange={e => { tab === "create" ? setCreateName(e.target.value) : setJoinName(e.target.value); setErr(""); }}
              onKeyDown={e => e.key === "Enter" && (tab === "create" ? handleCreate() : handleJoin())}
              className="rog-input"
              style={inputStyle}
              autoComplete="off"
            />

            {tab === "join" && (
              <>
                <label style={{ ...labelStyle, marginTop: 16 }}>ROOM CODE</label>
                <div style={{ position: "relative" }}>
                  <input
                    placeholder="Paste 16-character room code"
                    value={joinId}
                    onChange={e => { setJoinId(e.target.value.trim()); setErr(""); }}
                    onKeyDown={e => e.key === "Enter" && handleJoin()}
                    maxLength={16}
                    className="rog-input"
                    style={{ ...inputStyle, fontFamily: "monospace", letterSpacing: 3 }}
                    autoComplete="off"
                  />
                  <span style={{
                    position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                    color: joinId.length === 16 ? "#ff0033" : "#333",
                    fontSize: 10, fontWeight: 700, fontFamily: "monospace",
                  }}>
                    {joinId.length}/16
                  </span>
                </div>
              </>
            )}

            {err && (
              <div style={{ color: "#ff0033", fontSize: 11, marginTop: 12, letterSpacing: 1, display: "flex", alignItems: "center", gap: 6 }}>
                <span className="blink">▶</span> {err}
              </div>
            )}

            <button
              onClick={tab === "create" ? handleCreate : handleJoin}
              className="rog-btn"
              style={{
                width: "100%", marginTop: 20, padding: "15px",
                background: "linear-gradient(135deg, #ff0033 0%, #cc0022 100%)",
                color: "#fff", border: "none",
                fontSize: 13, fontWeight: 900, cursor: "pointer",
                letterSpacing: 3, textTransform: "uppercase", fontFamily: "monospace",
                clipPath: "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
                boxShadow: "0 0 20px rgba(255,0,51,0.4)",
              }}
            >
              {tab === "create" ? "▶ INITIALIZE ROOM" : "▶ CONNECT TO ROOM"}
            </button>
          </div>
        </div>

        <p style={{ color: "#2a2a2a", fontSize: 10, textAlign: "center", marginTop: 16, letterSpacing: 2, textTransform: "uppercase" }}>
          No account · WebRTC encrypted · Zero latency
        </p>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 10, fontWeight: 700,
  letterSpacing: 2, color: "#ff0033", marginBottom: 8,
  textTransform: "uppercase", fontFamily: "monospace",
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "13px 14px",
  background: "#0a0a0a",
  border: "1px solid rgba(255,0,51,0.25)",
  borderRadius: 0, color: "#f0f0f0", fontSize: 16,
  outline: "none", boxSizing: "border-box", fontFamily: "inherit",
  transition: "border-color 0.2s, box-shadow 0.2s",
};

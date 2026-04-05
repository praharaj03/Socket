"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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

// ── Honeycomb Canvas ──────────────────────────────────────────────────────────
function HoneycombBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouse     = useRef({ x: -9999, y: -9999 });
  const rafRef    = useRef<number>(0);

  const hexPath = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) => {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      i === 0 ? ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
              : ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    ctx.closePath();
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const R = 32;
    const mx = mouse.current.x;
    const my = mouse.current.y;
    const t  = Date.now() / 1000;

    ctx.clearRect(0, 0, W, H);

    const colW = R * Math.sqrt(3);
    const rowH = R * 1.5;
    const cols = Math.ceil(W / colW) + 2;
    const rows = Math.ceil(H / rowH) + 2;

    for (let row = -1; row < rows; row++) {
      for (let col = -1; col < cols; col++) {
        const cx = col * colW + (row % 2 === 0 ? 0 : colW / 2);
        const cy = row * rowH;

        const dx   = cx - mx;
        const dy   = cy - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxD = 160;

        // Ripple wave from mouse
        const wave    = Math.max(0, 1 - dist / maxD);
        // Ambient pulse per hex (staggered)
        const pulse   = Math.sin(t * 1.2 + col * 0.4 + row * 0.6) * 0.5 + 0.5;
        const ambient = pulse * 0.06;

        const alpha   = wave * 0.55 + ambient;
        const glowR   = wave * 8;

        if (alpha < 0.01) {
          // Draw faint outline only
          hexPath(ctx, cx, cy, R - 1);
          ctx.strokeStyle = "rgba(255,0,51,0.06)";
          ctx.lineWidth   = 0.8;
          ctx.stroke();
          continue;
        }

        // Fill glow
        hexPath(ctx, cx, cy, R - 1);
        ctx.fillStyle = `rgba(255,0,51,${alpha * 0.18})`;
        ctx.fill();

        // Stroke
        ctx.strokeStyle = `rgba(255,0,51,${Math.min(alpha + 0.1, 0.9)})`;
        ctx.lineWidth   = 1;
        ctx.stroke();

        // Inner glow for close hexes
        if (glowR > 1) {
          const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
          grad.addColorStop(0, `rgba(255,0,51,${wave * 0.3})`);
          grad.addColorStop(1, "rgba(255,0,51,0)");
          hexPath(ctx, cx, cy, R - 1);
          ctx.fillStyle = grad;
          ctx.fill();
        }
      }
    }

    rafRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const onMove = (e: MouseEvent) => { mouse.current = { x: e.clientX, y: e.clientY }; };
    const onTouch = (e: TouchEvent) => {
      if (e.touches[0]) mouse.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const onLeave = () => { mouse.current = { x: -9999, y: -9999 }; };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onTouch, { passive: true });
    window.addEventListener("mouseleave", onLeave);

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onTouch);
      window.removeEventListener("mouseleave", onLeave);
    };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", opacity: 0.9 }}
    />
  );
}

// ── Home Page ─────────────────────────────────────────────────────────────────
export default function Home() {
  const [tab,        setTab]        = useState<"create" | "join">("create");
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
    if (!joinName.trim())            { setErr("ENTER YOUR CALLSIGN"); return; }
    if (!joinId.trim())              { setErr("ENTER ROOM CODE"); return; }
    if (joinId.trim().length !== 16) { setErr("ROOM CODE MUST BE 16 CHARACTERS"); return; }
    router.push(`/room/${joinId.trim()}?name=${encodeURIComponent(joinName.trim())}`);
  };

  const switchTab = (t: "create" | "join") => { setTab(t); setErr(""); };

  return (
    <div style={{ minHeight: "100dvh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, position: "relative", overflow: "hidden" }}>

      {/* Interactive honeycomb */}
      <HoneycombBg />

      {/* Red bottom glow */}
      <div style={{ position: "fixed", bottom: -100, left: "50%", transform: "translateX(-50%)", width: 700, height: 300, background: "radial-gradient(ellipse, rgba(255,0,51,0.15) 0%, transparent 70%)", pointerEvents: "none", filter: "blur(20px)" }} />

      {/* Corner accents */}
      <div style={{ position: "fixed", top: 0, left: 0, width: 120, height: 120, borderTop: "1px solid rgba(255,0,51,0.4)", borderLeft: "1px solid rgba(255,0,51,0.4)", pointerEvents: "none" }} />
      <div style={{ position: "fixed", top: 0, right: 0, width: 120, height: 120, borderTop: "1px solid rgba(255,0,51,0.4)", borderRight: "1px solid rgba(255,0,51,0.4)", pointerEvents: "none" }} />
      <div style={{ position: "fixed", bottom: 0, left: 0, width: 120, height: 120, borderBottom: "1px solid rgba(255,0,51,0.4)", borderLeft: "1px solid rgba(255,0,51,0.4)", pointerEvents: "none" }} />
      <div style={{ position: "fixed", bottom: 0, right: 0, width: 120, height: 120, borderBottom: "1px solid rgba(255,0,51,0.4)", borderRight: "1px solid rgba(255,0,51,0.4)", pointerEvents: "none" }} />

      <div className="flicker" style={{ width: "100%", maxWidth: 400, position: "relative", zIndex: 10 }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ lineHeight: 1 }}>
            <Image src="/logo.png" alt="Vaartalav" width={80} height={80} loading="eager" priority style={{ width: 80, height: "auto", filter: "drop-shadow(0 0 16px rgba(255,0,51,0.8))" }} />
          </div>
          <h1 className="glitch neon-text" data-text="VAARTALAV" style={{ color: "#ff0033", fontSize: 32, fontWeight: 900, margin: "12px 0 4px", letterSpacing: 6, fontFamily: "monospace" }}>
            VAARTALAV
          </h1>
          <div className="rgb-line" style={{ margin: "8px auto", width: 160 }} />
          <p style={{ color: "#555", fontSize: 11, letterSpacing: 3, marginTop: 8, textTransform: "uppercase" }}>
            Real-time · Chat · Voice
          </p>
        </div>

        {/* Card */}
        <div style={{ background: "linear-gradient(135deg, #0f0f0f 0%, #141414 100%)", border: "1px solid rgba(255,0,51,0.3)", position: "relative", clipPath: "polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 20px 100%, 0 calc(100% - 20px))", boxShadow: "0 0 40px rgba(255,0,51,0.1), inset 0 0 40px rgba(255,0,51,0.03)" }}>
          <div className="corner-tl" /><div className="corner-tr" />
          <div className="corner-bl" /><div className="corner-br" />

          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid rgba(255,0,51,0.2)" }}>
            {(["create", "join"] as const).map(t => (
              <button key={t} onClick={() => switchTab(t)} className="rog-btn" style={{ flex: 1, padding: "16px 14px", background: tab === t ? "rgba(255,0,51,0.08)" : "none", border: "none", borderBottom: tab === t ? "2px solid #ff0033" : "2px solid transparent", color: tab === t ? "#ff0033" : "#555", fontWeight: 700, fontSize: 13, cursor: "pointer", letterSpacing: 2, textTransform: "uppercase", fontFamily: "monospace", transition: "all 0.2s" }}>
                {t === "create" ? "[ CREATE ]" : "[ JOIN ]"}
              </button>
            ))}
          </div>

          {/* Form */}
          <div style={{ padding: "28px 28px 24px" }}>
            <p style={{ color: "#444", fontSize: 11, marginBottom: 20, letterSpacing: 1, textTransform: "uppercase" }}>
              {tab === "create" ? "A unique 16-char room code will be generated" : "Enter the room code shared by the host"}
            </p>

            <label style={labelStyle}>CALLSIGN</label>
            <input
              placeholder="Enter your name"
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
                  <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: joinId.length === 16 ? "#ff0033" : "#333", fontSize: 10, fontWeight: 700, fontFamily: "monospace" }}>
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

            <button onClick={tab === "create" ? handleCreate : handleJoin} className="rog-btn" style={{ width: "100%", marginTop: 20, padding: "15px", background: "linear-gradient(135deg, #ff0033 0%, #cc0022 100%)", color: "#fff", border: "none", fontSize: 13, fontWeight: 900, cursor: "pointer", letterSpacing: 3, textTransform: "uppercase", fontFamily: "monospace", clipPath: "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))", boxShadow: "0 0 20px rgba(255,0,51,0.4)" }}>
              {tab === "create" ? "▶ INITIALIZE ROOM" : "▶ CONNECT TO ROOM"}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          {/* Feature badges */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            {[
              { icon: "🔒", label: "NO ACCOUNT" },
              { icon: "🔐", label: "WebRTC ENCRYPTED" },
              { icon: "⚡", label: "ZERO LATENCY" },
            ].map(f => (
              <div key={f.label} style={{
                display: "flex", alignItems: "center", gap: 5,
                background: "rgba(255,0,51,0.06)",
                border: "1px solid rgba(255,0,51,0.2)",
                padding: "5px 10px",
                clipPath: "polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)",
              }}>
                <span style={{ fontSize: 11 }}>{f.icon}</span>
                <span style={{ color: "#ff0033", fontSize: 9, fontWeight: 700, letterSpacing: 1.5, fontFamily: "monospace" }}>{f.label}</span>
              </div>
            ))}
          </div>

          {/* Developer credit */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <div style={{ height: 1, width: 40, background: "linear-gradient(90deg, transparent, rgba(255,0,51,0.4))" }} />
            <div style={{ textAlign: "center" }}>
              <span style={{ color: "#333", fontSize: 9, letterSpacing: 2, fontFamily: "monospace", textTransform: "uppercase" }}>DEVELOPER</span>
              <span style={{ color: "rgba(255,0,51,0.4)", fontSize: 9, fontFamily: "monospace", margin: "0 6px" }}>_</span>
              <span style={{ color: "#ff0033", fontSize: 11, fontWeight: 900, letterSpacing: 3, fontFamily: "monospace", textShadow: "0 0 8px rgba(255,0,51,0.6)" }} className="neon-text">ABHISEK</span>
            </div>
            <div style={{ height: 1, width: 40, background: "linear-gradient(90deg, rgba(255,0,51,0.4), transparent)" }} />
          </div>
        </div>
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

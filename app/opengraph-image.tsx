import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size    = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%",
          background: "#0a0a0a",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* Red border */}
        <div style={{ position: "absolute", inset: 0, border: "4px solid #ff0033", display: "flex" }} />

        {/* Corner accents */}
        <div style={{ position: "absolute", top: 20, left: 20, width: 60, height: 60, borderTop: "3px solid #ff0033", borderLeft: "3px solid #ff0033", display: "flex" }} />
        <div style={{ position: "absolute", top: 20, right: 20, width: 60, height: 60, borderTop: "3px solid #ff0033", borderRight: "3px solid #ff0033", display: "flex" }} />
        <div style={{ position: "absolute", bottom: 20, left: 20, width: 60, height: 60, borderBottom: "3px solid #ff0033", borderLeft: "3px solid #ff0033", display: "flex" }} />
        <div style={{ position: "absolute", bottom: 20, right: 20, width: 60, height: 60, borderBottom: "3px solid #ff0033", borderRight: "3px solid #ff0033", display: "flex" }} />

        {/* Title */}
        <div style={{ color: "#ff0033", fontSize: 80, fontWeight: 900, letterSpacing: 12, display: "flex" }}>
          VAARTALAV
        </div>

        {/* Divider */}
        <div style={{ width: 400, height: 3, background: "#ff0033", margin: "20px 0", display: "flex" }} />

        {/* Subtitle */}
        <div style={{ color: "#888", fontSize: 28, letterSpacing: 6, textTransform: "uppercase", display: "flex" }}>
          Real-Time Gaming Chat &amp; Voice Rooms
        </div>

        {/* Tags */}
        <div style={{ display: "flex", gap: 16, marginTop: 40 }}>
          {["No Account", "WebRTC Voice", "Private Rooms", "Instant Chat"].map(tag => (
            <div key={tag} style={{
              background: "rgba(255,0,51,0.1)", border: "1px solid rgba(255,0,51,0.4)",
              color: "#ff0033", fontSize: 18, padding: "8px 20px", letterSpacing: 2, display: "flex",
            }}>
              {tag}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}

export default function RogLogo({ size = 48 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ filter: "drop-shadow(0 0 10px rgba(255,0,51,0.9)) drop-shadow(0 0 24px rgba(255,0,51,0.5))" }}
    >
      {/* Outer hexagon */}
      <polygon points="50,4 93,27 93,73 50,96 7,73 7,27" fill="#0a0a0a" stroke="#ff0033" strokeWidth="2.5" />
      {/* Inner hexagon faint */}
      <polygon points="50,14 83,32 83,68 50,86 17,68 17,32" fill="none" stroke="#ff0033" strokeWidth="1" opacity="0.25" />

      {/* Eye top arc */}
      <path d="M22 50 Q50 18 78 50" stroke="#ff0033" strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* Eye bottom arc */}
      <path d="M22 50 Q50 82 78 50" stroke="#ff0033" strokeWidth="3" fill="none" strokeLinecap="round" />

      {/* Iris */}
      <circle cx="50" cy="50" r="13" fill="none" stroke="#ff0033" strokeWidth="2.5" />
      {/* Pupil static */}
      <circle cx="50" cy="50" r="5" fill="#ff0033" />
      {/* Pupil pulse */}
      <circle cx="50" cy="50" r="5" fill="#ff0033" opacity="0.5">
        <animate attributeName="r"       values="5;8;5"       dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.5;0.1;0.5" dur="2s" repeatCount="indefinite" />
      </circle>

      {/* ROG diagonal slash */}
      <line x1="63" y1="33" x2="81" y2="67" stroke="#ff0033" strokeWidth="3.5" strokeLinecap="round" />
      <line x1="65" y1="33" x2="83" y2="67" stroke="#ff0033" strokeWidth="1"   strokeLinecap="round" opacity="0.35" />

      {/* Corner ticks */}
      <line x1="7"  y1="27" x2="15" y2="32" stroke="#ff0033" strokeWidth="1.5" opacity="0.5" />
      <line x1="93" y1="27" x2="85" y2="32" stroke="#ff0033" strokeWidth="1.5" opacity="0.5" />
      <line x1="7"  y1="73" x2="15" y2="68" stroke="#ff0033" strokeWidth="1.5" opacity="0.5" />
      <line x1="93" y1="73" x2="85" y2="68" stroke="#ff0033" strokeWidth="1.5" opacity="0.5" />
    </svg>
  );
}

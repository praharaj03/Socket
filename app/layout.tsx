import type { Metadata } from "next";
import { Rajdhani } from "next/font/google";
import "./globals.css";

const rajdhani = Rajdhani({
  weight: ["400", "600", "700"],
  subsets: ["latin"],
  variable: "--font-rajdhani",
});

export const metadata: Metadata = {
  title: "Vaartalav — Combat Chat & Voice",
  description: "Vaartalav: Real-time rooms with instant chat and WebRTC voice calls.",
  keywords: ["Vaartalav", "chat", "voice call", "rooms", "WebRTC", "gaming"],
  authors: [{ name: "Vaartalav" }],
  openGraph: {
    title: "Vaartalav — Combat Chat & Voice",
    description: "Real-time rooms with instant chat and WebRTC voice calls.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${rajdhani.variable} h-full`}>
      <head>
        <link rel="icon" href="/logo.png" />
      </head>
      <body style={{ fontFamily: "var(--font-rajdhani), 'Segoe UI', sans-serif" }} className="min-h-full">
        {children}
      </body>
    </html>
  );
}

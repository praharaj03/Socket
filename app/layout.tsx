import type { Metadata } from "next";
import { Rajdhani } from "next/font/google";
import "./globals.css";

const rajdhani = Rajdhani({
  weight: ["400", "600", "700"],
  subsets: ["latin"],
  variable: "--font-rajdhani",
});

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://vaartalav.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "Vaartalav — Real-Time Gaming Chat & Voice Rooms",
    template: "%s | Vaartalav",
  },
  description:
    "Vaartalav is a free real-time chat and voice room app built for gamers. Create or join private rooms instantly — no account needed. Powered by WebRTC.",
  keywords: [
    "Vaartalav", "gaming chat", "voice rooms", "real-time chat", "WebRTC",
    "private chat rooms", "online gaming communication", "free voice chat",
    "no signup chat", "instant chat rooms",
  ],
  authors: [{ name: "Vaartalav", url: BASE_URL }],
  creator: "Vaartalav",
  publisher: "Vaartalav",
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  alternates: { canonical: BASE_URL },
  openGraph: {
    type: "website",
    url: BASE_URL,
    siteName: "Vaartalav",
    title: "Vaartalav — Real-Time Gaming Chat & Voice Rooms",
    description:
      "Create or join private gaming rooms instantly. Real-time chat + WebRTC voice calls. No account needed.",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Vaartalav Gaming Chat" }],
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Vaartalav — Real-Time Gaming Chat & Voice Rooms",
    description: "Free private gaming rooms with real-time chat and WebRTC voice. No signup.",
    images: ["/og-image.png"],
    creator: "@vaartalav",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.svg",    type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
  category: "gaming",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${rajdhani.variable} h-full`}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* Chat bubble favicon */}
        <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='22' fill='%230a0a0a'/%3E%3Crect width='100' height='100' rx='22' fill='none' stroke='%23ff0033' stroke-width='4'/%3E%3Cpath d='M20 30 Q20 20 30 20 L70 20 Q80 20 80 30 L80 58 Q80 68 70 68 L54 68 L44 80 L44 68 L30 68 Q20 68 20 58 Z' fill='%23ff0033'/%3E%3Ccircle cx='38' cy='44' r='5' fill='%230a0a0a'/%3E%3Ccircle cx='50' cy='44' r='5' fill='%230a0a0a'/%3E%3Ccircle cx='62' cy='44' r='5' fill='%230a0a0a'/%3E%3C/svg%3E" />
        <meta name="theme-color" content="#ff0033" />
        <meta name="color-scheme" content="dark" />
        <link rel="preconnect" href={process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:3001"} />
      </head>
      <body style={{ fontFamily: "var(--font-rajdhani), 'Segoe UI', sans-serif" }} className="min-h-full">
        {children}
      </body>
    </html>
  );
}

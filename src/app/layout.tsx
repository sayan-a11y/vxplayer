import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VX Player — Play Everything. Anywhere. Offline.",
  description:
    "VX Player is a professional, fast, privacy-focused, offline-first video player with advanced controls, subtitles, playlists and a premium modern interface.",
  keywords: ["VX Player", "video player", "offline", "subtitles", "playlists"],
  authors: [{ name: "VX Player" }],
  icons: {
    icon: "/thumbs/vx_logo.png",
  },
  openGraph: {
    title: "VX Player",
    description: "Play Everything. Anywhere. Offline.",
    siteName: "VX Player",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}

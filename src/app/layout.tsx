import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SlackRail, SlackSidebar, SlackHeader } from "@/components/SlackNav";
import { ClientProviders } from "@/components/ClientProviders";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Secretary - AI 비서",
  description: "AI 비서 시스템",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="h-screen flex overflow-hidden">
          {/* Icon Rail (70px) */}
          <SlackRail />

          {/* Sidebar (289px) */}
          <SlackSidebar />

          {/* Main Area */}
          <div className="slack-main">
            <SlackHeader />
            <div className="slack-content scroll-thin">
              <div>{children}</div>
            </div>
          </div>
        </div>

        {/* Client-side overlays: Command Palette + Chat Sidebar */}
        <ClientProviders />
      </body>
    </html>
  );
}

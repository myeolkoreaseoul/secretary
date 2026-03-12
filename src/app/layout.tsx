import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import { SlackRail, SlackSidebar, SlackHeader } from "@/components/SlackNav";
import { ClientProviders } from "@/components/ClientProviders";
import "./globals.css";

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
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body
        className={`${geistMono.variable} antialiased`}
        style={{ fontFamily: "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, 'Helvetica Neue', sans-serif" }}
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

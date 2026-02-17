import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import {
  Home,
  LayoutGrid,
  MessageSquare,
  CheckSquare,
  Clock,
  Settings,
  Command,
} from "lucide-react";
import { ClientProviders, TimerWidget } from "@/components/ClientProviders";
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
  title: "Secretary - AI 비서 대시보드",
  description: "텔레그램 기반 AI 비서 관리 시스템",
};

const navItems = [
  { href: "/", label: "대시보드", icon: Home },
  { href: "/categories", label: "카테고리", icon: LayoutGrid },
  { href: "/history", label: "대화", icon: MessageSquare },
  { href: "/todos", label: "할일", icon: CheckSquare },
  { href: "/time", label: "시간", icon: Clock },
  { href: "/settings", label: "설정", icon: Settings },
];

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
        <div className="min-h-screen flex">
          {/* Sidebar */}
          <aside className="w-56 border-r border-sidebar-border bg-sidebar flex flex-col shrink-0">
            <div className="p-4 border-b border-sidebar-border">
              <Link href="/" className="text-lg font-bold text-sidebar-foreground">
                Secretary
              </Link>
              <p className="text-xs text-muted-foreground mt-0.5">AI 비서 대시보드</p>
            </div>
            <nav className="flex-1 p-2 space-y-1">
              {navItems.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              ))}
            </nav>
            <div className="p-3 border-t border-sidebar-border space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Command className="w-3 h-3" />
                <span>Ctrl+K 명령 팔레트</span>
              </div>
              <p className="text-xs text-muted-foreground">v2.1 &middot; Web + Telegram + Claude</p>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 overflow-auto">
            {/* Header bar with timer */}
            <div className="border-b border-border px-6 py-2 flex items-center justify-end">
              <TimerWidget />
            </div>
            <div className="max-w-6xl mx-auto px-6 py-6">
              {children}
            </div>
          </main>
        </div>

        {/* Client-side overlays: Command Palette + Chat Sidebar */}
        <ClientProviders />
      </body>
    </html>
  );
}

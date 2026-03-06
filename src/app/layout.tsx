"use client";
import "./globals.css";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CheckSquare,
  Clock,
  MessageSquare,
  Youtube,
  Settings,
  Search,
  Timer
} from "lucide-react";
import { useEffect, useState } from "react";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/todos", label: "Tasks", icon: CheckSquare },
  { href: "/time", label: "Time", icon: Clock },
  { href: "/history", label: "History", icon: MessageSquare },
  { href: "/yt", label: "YouTube", icon: Youtube },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [timerActive, setTimerActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(25 * 60);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (timerActive && timeLeft > 0) {
      interval = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    } else if (timeLeft === 0) {
      setTimerActive(false);
    }
    return () => clearInterval(interval);
  }, [timerActive, timeLeft]);

  const toggleTimer = () => setTimerActive(!timerActive);
  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <html lang="ko" className="dark">
      <body className="antialiased bg-bg-base text-grey-800 flex flex-col h-screen overflow-hidden">
        {/* L1: Global Nav Bar */}
        <header className="sticky top-0 z-50 h-[52px] border-b border-hairline bg-bg-base flex items-center px-6 shrink-0">
          {/* Logo */}
          <Link href="/" className="font-bold text-[15px] text-grey-900 tracking-tight mr-8">
            SECRETARY
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative px-3 py-1.5 text-[14px] font-semibold transition-colors ${
                    active ? "text-grey-900" : "text-grey-500 hover:text-grey-700"
                  }`}
                >
                  {item.label}
                  {active && (
                    <span className="absolute bottom-[-14px] left-1/2 -translate-x-1/2 w-5 h-[2px] bg-blue-500 rounded-full" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Right side */}
          <div className="ml-auto flex items-center gap-3">
            {/* Timer */}
            <button
              onClick={toggleTimer}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${
                timerActive
                  ? "bg-blue-500/10 text-blue-500 border border-blue-500/20"
                  : "bg-bg-level1 text-grey-600 border border-hairline hover:text-grey-800"
              }`}
            >
              <Timer size={14} />
              <span className="font-mono w-10 text-center">{formatTime(timeLeft)}</span>
            </button>

            {/* Search hint */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-level1 border border-hairline text-grey-500 text-[12px]">
              <Search size={14} />
              <span>Search</span>
              <kbd className="font-mono bg-bg-level2 px-1.5 py-0.5 rounded text-[10px] text-grey-400">/</kbd>
            </div>

            {/* Settings */}
            <Link href="/settings" className="p-2 rounded-lg text-grey-500 hover:text-grey-700 hover:bg-bg-level1 transition-colors">
              <Settings size={18} />
            </Link>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6">
          {children}
        </main>

        {/* Mobile Bottom Tab */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-bg-base/95 backdrop-blur-sm border-t border-hairline px-4 pt-2 pb-6 flex justify-around items-center z-50">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={`flex flex-col items-center gap-1 ${active ? "text-blue-500" : "text-grey-500"}`}>
                <Icon size={20} />
                <span className="text-[10px] font-semibold">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </body>
    </html>
  );
}

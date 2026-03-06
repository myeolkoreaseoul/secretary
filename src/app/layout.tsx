"use client";
import "./globals.css";
import { Plus_Jakarta_Sans } from "next/font/google";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquare,
  CheckSquare,
  Clock,
  Youtube,
  Settings,
  Search,
  Timer
} from "lucide-react";
import { useEffect, useState } from "react";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans" });

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/todos", label: "Tasks", icon: CheckSquare },
  { href: "/time", label: "Time", icon: Clock },
  { href: "/history", label: "History", icon: MessageSquare },
  { href: "/yt", label: "YouTube", icon: Youtube },
  { href: "/settings", label: "Settings", icon: Settings },
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
      <body className={`${jakarta.variable} antialiased bg-dark-bg text-slate-100 flex h-screen overflow-hidden`}>
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex w-64 flex-col border-r border-border-color bg-dark-bg/80 backdrop-blur-xl shrink-0">
          <div className="p-6 flex items-center gap-3">
            <div className="size-8 rounded-lg bg-gradient-to-br from-primary-neon to-accent-purple flex items-center justify-center shadow-lg shadow-primary-neon/20">
              <span className="font-bold text-white text-sm">S</span>
            </div>
            <span className="font-extrabold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-primary-neon to-accent-purple">SECRETARY</span>
          </div>
          <nav className="flex-1 px-4 space-y-2">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${active ? 'bg-zinc-900 border border-zinc-800 text-primary-neon' : 'text-zinc-400 hover:text-slate-200 hover:bg-zinc-900/50'}`}>
                  <Icon size={18} />
                  <span className="text-sm font-semibold tracking-wide">{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="p-4 mt-auto border-t border-border-color">
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-zinc-900/50 border border-zinc-800/50 text-zinc-400 text-xs">
              <span className="flex items-center gap-2"><Search size={14} /> Search</span>
              <kbd className="font-mono bg-zinc-800 px-1.5 py-0.5 rounded text-[10px]">Ctrl+K</kbd>
            </div>
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0">
          {/* Topbar */}
          <header className="h-16 border-b border-border-color flex items-center justify-between px-6 bg-dark-bg/80 backdrop-blur-xl shrink-0">
            <div className="md:hidden font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-primary-neon to-accent-purple">SECRETARY</div>
            <div className="hidden md:block text-lg font-bold">{NAV_ITEMS.find(n => pathname === n.href || (n.href !== "/" && pathname.startsWith(n.href)))?.label || "Dashboard"}</div>
            
            <button onClick={toggleTimer} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-semibold transition-all ${timerActive ? 'border-primary-neon text-primary-neon bg-primary-neon/10 neon-border-blue' : 'border-zinc-800 text-zinc-400 bg-zinc-900 hover:text-slate-200'}`}>
              <Timer size={16} />
              <span className="font-mono w-12 text-center">{formatTime(timeLeft)}</span>
            </button>
          </header>

          {/* Main Content */}
          <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6">
            {children}
          </main>
        </div>

        {/* Mobile Tabbar */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-dark-bg/90 backdrop-blur-2xl border-t border-border-color px-6 pt-3 pb-8 flex justify-between items-center z-50">
          {NAV_ITEMS.slice(0, 5).map((item) => {
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={`flex flex-col items-center gap-1 ${active ? 'text-primary-neon' : 'text-zinc-500'}`}>
                <Icon size={active ? 24 : 20} className="transition-all" />
                <span className="text-[10px] font-bold tracking-tighter uppercase">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </body>
    </html>
  );
}

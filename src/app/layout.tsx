import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
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
  title: "Secretary - CEO 개인 비서",
  description: "AI 직원들과의 대화 기록 및 생각 분리수거 시스템",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="min-h-screen flex flex-col">
          <header className="border-b border-gray-200 dark:border-gray-800">
            <nav className="max-w-6xl mx-auto px-4 py-4">
              <div className="flex items-center justify-between">
                <Link href="/" className="text-xl font-bold">
                  Secretary
                </Link>
                <div className="flex gap-6">
                  <Link
                    href="/"
                    className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                  >
                    생각 입력
                  </Link>
                  <Link
                    href="/conversations"
                    className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                  >
                    대화 목록
                  </Link>
                  <Link
                    href="/search"
                    className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                  >
                    검색
                  </Link>
                  <Link
                    href="/report"
                    className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                  >
                    리포트
                  </Link>
                </div>
              </div>
            </nav>
          </header>
          <main className="flex-1 max-w-6xl mx-auto px-4 py-8 w-full">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}

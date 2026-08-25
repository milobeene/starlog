import type { Metadata } from "next";
import { Inter, Syncopate } from "next/font/google";
import FluidBackground from "@/components/background/FluidBackground";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

/** 로고 전용. 본문에 쓰면 한글이 폴백으로 새기 때문에 워드마크에만 붙인다 */
const syncopate = Syncopate({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-syncopate",
  display: "swap",
});

export const metadata: Metadata = {
  title: "STARLOG",
  description: "게임 백로그를 기록하고 되돌아보는 개인 아카이브",
};

/**
 * 배경은 여기 한 장만 깔린다 — 라우트를 옮겨도 WebGL 컨텍스트가 유지돼야
 * 유체 흐름이 끊기지 않고 페이지 사이에서 이어진다
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${inter.variable} ${syncopate.variable}`}>
      <body>
        <FluidBackground />
        <div className="relative z-10 flex h-screen w-full flex-col">{children}</div>
      </body>
    </html>
  );
}

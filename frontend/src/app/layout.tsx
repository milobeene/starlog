import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "게임 백로그",
  description: "게임 백로그 관리",
};

/** 루트에는 아무 껍데기도 두지 않는다 — 헤더는 (app) 레이아웃에만 있고 (public)에는 없다 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

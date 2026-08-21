import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "게임 백로그",
  description: "게임 백로그 관리",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

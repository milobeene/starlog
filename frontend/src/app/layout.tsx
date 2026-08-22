import type { Metadata } from "next";
import AppHeader from "@/components/layout/AppHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: "게임 백로그",
  description: "게임 백로그 관리",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <body>
        <AppHeader />
        {children}
      </body>
    </html>
  );
}

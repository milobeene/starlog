import type { Metadata } from "next";
import { Syncopate } from "next/font/google";
import localFont from "next/font/local";
import FluidBackground from "@/components/background/FluidBackground";
import "./globals.css";

/*
 * 본문 세 벌은 **전부 가변 폰트**라 파일 하나가 모든 굵기를 덮는다.
 * 예전 Inter는 굵기 4종을 따로 받아왔는데(300/400/500/600), 가변은 그 사이 값도 나온다.
 *
 * 구글 폰트 대신 로컬로 두는 이유 — 외부 요청이 사라지고, 버전이 고정된다.
 * (Syncopate만 구글에 남는다. 워드마크 한 곳에만 쓰이는 700 한 벌이라 옮길 이득이 없다)
 */
const switzer = localFont({
  src: "./fonts/Switzer-Variable.woff2",
  variable: "--font-switzer",
  weight: "100 900",
  display: "swap",
});

/**
 * 한글. Switzer와 뼈대가 비슷해 한 줄에 섞여도 높이·굵기가 안 튄다 —
 * 예전엔 Apple SD Gothic Neo로 폴백했는데 그건 맥에서만 되고 윈도우에선 다른 폰트가 나왔다.
 *
 * 2MB로 무겁다. 한글 글리프가 1만 자를 넘어서인데, display:swap이라
 * 폰트가 오기 전에도 글자는 폴백으로 먼저 그려진다. 무거우면 서브셋을 나눈다
 */
const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  variable: "--font-pretendard",
  weight: "45 920",
  display: "swap",
});

/**
 * 숫자 전용. 평점·가격·개수처럼 자릿수가 흔들리면 안 되는 곳에 쓴다.
 * 0에 사선이 있어 O와 안 헷갈리고, 폭이 균일해 표에서 자릿수가 맞는다
 */
const jetbrainsMono = localFont({
  src: "./fonts/JetBrainsMono-Variable.ttf",
  variable: "--font-jetbrains",
  weight: "100 800",
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
    <html
      lang="ko"
      className={`${switzer.variable} ${pretendard.variable} ${jetbrainsMono.variable} ${syncopate.variable}`}
    >
      <body>
        <FluidBackground />
        <div className="relative z-10 flex h-screen w-full flex-col">{children}</div>
      </body>
    </html>
  );
}

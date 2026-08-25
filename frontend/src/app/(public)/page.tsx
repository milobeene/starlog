"use client";

import Link from "next/link";
import { logout, useSession } from "@/lib/session";

/**
 * 표지 한 장. 서비스 이름이 주인공이고 버튼은 둘뿐이다.
 *
 * 버튼 영역이 살짝 늦게 뜬다 — 로그인 여부를 확인하고 나서 그려지기 때문.
 * 배경 연출이 그 시간을 덮는다
 */
export default function LandingPage() {
  const session = useSession();

  return (
    <main className="relative flex h-full w-full flex-col items-center justify-center">
      <div className="flex w-full flex-col items-center px-8 text-center">
        <h1 className="font-display text-[12vw] leading-none font-bold tracking-tighter text-white/90 drop-shadow-2xl select-none">
          STARLOG
        </h1>
        <p className="mt-4 mb-16 max-w-2xl text-xl font-light text-white/60 md:text-2xl">
          플레이한 게임을 기록하고 되돌아보는 개인 아카이브입니다.
        </p>

        {/* 판정 중에도 높이를 차지한다 — 버튼이 나타날 때 글자가 밀려 올라가면 안 된다 */}
        <div className="flex h-[46px] items-center space-x-6">
          {session.status === "loading" ? null : session.status === "member" ? (
            <>
              <Link href="/dashboard" className={BUTTON}>
                Continue as {session.me.profile.nickname}
              </Link>
              <button onClick={() => void logout()} className={BUTTON}>
                Log out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className={BUTTON}>
                Log in
              </Link>
              <Link href="/signup" className={BUTTON}>
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>

      {/*
        출처 표기는 상세 화면이 아니라 여기 있는다 — 게임마다 반복될 정보가 아니라
        서비스 전체의 데이터 출처다. IGDB는 Twitch 개발자 약관상 표기가 필요하다
      */}
      <footer className="absolute inset-x-0 bottom-6 text-center text-[11px] leading-relaxed text-white/30">
        Game data:{" "}
        <a
          href="https://www.igdb.com"
          target="_blank"
          rel="noreferrer noopener"
          className="underline underline-offset-2 transition-colors hover:text-white/60"
        >
          IGDB.com
        </a>
        <br />
        Used under the Twitch Developer Services Agreement.
      </footer>
    </main>
  );
}

const BUTTON =
  "rounded-full border border-white/20 px-8 py-3 text-sm font-medium tracking-widest uppercase transition-all duration-300 hover:bg-white hover:text-black";

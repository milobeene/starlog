"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import EntryLoader from "@/components/ui/EntryLoader";
import { useSession } from "@/lib/session";

/**
 * 표지 한 장. 서비스 이름이 주인공이고 버튼은 둘뿐이다.
 *
 * 버튼 영역은 로그인 여부를 확인한 뒤에 그려진다. 그 사이를 EntryLoader가 채운다 —
 * Render 무료 티어가 잠들어 있으면 **3분까지** 걸리므로 빈 자리로 두면 고장 난 줄 안다.
 */

/**
 * 로더 최소 노출 시간.
 *
 * 서버가 깨어 있으면 판정이 0.2초 만에 끝난다. 그대로 두면 로더가 번쩍이고 사라져
 * 없는 것만 못하다. 빛이 한 번 훑는 데 1.9초라, 1.5초면 한 번을 채 못 보고 넘어간다 —
 * "뭔가 지나갔다"는 인상만 남기고 길을 막지 않는 선이다
 */
const MIN_LOADER_MS = 1500;

export default function LandingPage() {
  const session = useSession();

  /*
   * 재방문이면 useSession이 캐시된 답을 들고 첫 렌더에 온다 → 처음부터 ready.
   * 대시보드에 갔다 돌아올 때마다 로더가 뜨면 성가시다
   */
  const [ready, setReady] = useState(session.status !== "loading");
  // 렌더 중에 찍으면 안 된다 — ref 쓰기도 Date.now()도 렌더를 불순하게 만든다. effect에서 찍는다
  const mountedAt = useRef(0);

  useEffect(() => {
    if (mountedAt.current === 0) mountedAt.current = Date.now();
    if (ready || session.status === "loading") return;

    // 판정이 언제 끝났든 마운트 기준 MIN_LOADER_MS는 채운다
    const remain = Math.max(0, MIN_LOADER_MS - (Date.now() - mountedAt.current));
    const timer = setTimeout(() => setReady(true), remain);
    return () => clearTimeout(timer);
  }, [ready, session.status]);

  return (
    <main className="relative flex h-full w-full flex-col items-center justify-center">
      <div className="page-x flex w-full flex-col items-center text-center">
        <h1 className="font-display text-[15.5vw] leading-none font-bold tracking-tighter text-white/90 drop-shadow-2xl select-none min-[860px]:text-[12vw]">
          STARLOG
        </h1>
        <p className="mb-16 max-w-2xl text-[12px] font-light text-white/60 sm:text-base md:text-lg">
          플레이한 게임을 기록하고 되돌아보는 개인 아카이브
        </p>

        {/*
          판정 중에도 높이를 차지한다 — 버튼이 나타날 때 글자가 밀려 올라가면 안 된다.
          로더와 버튼을 같은 칸에 겹쳐 두고 투명도만 교차시킨다: 자리를 뺏고 뺏기지 않아
          전환이 흔들리지 않는다
        */}
        <div className="relative flex h-[46px] w-full items-center justify-center">
          <div
            className={`absolute transition-opacity duration-500 ${
              ready ? "pointer-events-none opacity-0" : "opacity-100"
            }`}
          >
            <EntryLoader />
          </div>

          <div
            /* 폰에서는 버튼 두 개가 나란히 안 들어가 글자가 두 줄로 쪼개진다 — 세로로 쌓는다 */
            className={`absolute flex flex-col items-stretch gap-3 transition-opacity duration-700 sm:flex-row sm:items-center sm:gap-0 sm:space-x-6 ${
              ready ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            {/*
              ## 임시 화면이다 — 5단계에서 갈아끼운다
              여기가 v1.0의 **모드 선택** 자리다: [로컬 모드] / [클라우드 모드].
              그때 이 화면은 스프링이 아니라 **일렉트론이 `app://`로 직접 로드**한다 —
              백엔드를 띄우기 *전에* 모드를 골라야 하기 때문이다 (architecture §2, 결정 40).
              지금은 인증만 걷어낸 상태라 들어가는 문 하나만 둔다
            */}
            <Link href="/dashboard" className={BUTTON}>
              들어가기
            </Link>
          </div>
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
  "whitespace-nowrap rounded-full border border-white/20 px-6 py-3 text-sm sm:px-8 font-medium tracking-widest uppercase transition-all duration-300 hover:bg-white hover:text-black";

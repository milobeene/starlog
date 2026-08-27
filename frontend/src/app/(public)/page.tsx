"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import SaveList from "@/components/entry/SaveList";
import ConnectionList from "@/components/entry/ConnectionList";
import LaunchOverlay from "@/components/entry/LaunchOverlay";
import { getBridge, type LaunchMode, type LaunchProgress } from "@/lib/desktop";

/**
 * 입구 — v1.0의 **모드 선택** 화면 (architecture §1·§2).
 *
 * ## 이 화면만 백엔드가 없다
 *
 * 일렉트론이 `app://`로 **스프링보다 먼저** 로드한다. 그래서 여기서는 `/api/*`를 부를 수
 * 없고, 필요한 일은 전부 `window.starlog`(preload)를 통한다.
 * "스프링이 프론트를 전부 서빙한다"는 원칙의 **유일한 예외**다.
 *
 * ## 브라우저에서 열면 예전 모습이다
 *
 * `npm run dev`에는 preload가 없어 `getBridge()`가 undefined다. 그때는 `[들어가기]`
 * 하나로 폴백한다 — **백엔드를 고칠 때 일렉트론을 거치지 않는 길**이 살아 있어야 한다.
 */
type Step = "web" | "mode" | "local" | "cloud" | "launching";

/**
 * 다리가 있는지.
 *
 * **`useEffect`에서 상태를 세우지 않는다** — 그러면 첫 페인트가 빈 화면이 되고
 * 리렌더가 한 번 더 돈다. `useSyncExternalStore`가 서버(정적 빌드) 값과 클라이언트 값을
 * 각각 주는 자리다. 구독할 것은 없다 — preload는 페이지가 로드되는 시점에 이미 결정돼 있고
 * 도중에 생기거나 사라지지 않는다
 */
const NO_SUBSCRIBE = () => () => {};

function useHasBridge() {
  return useSyncExternalStore(
    NO_SUBSCRIBE,
    () => getBridge() !== undefined,
    () => false,        // 정적 빌드는 Node에서 그린다 → 없는 쪽으로 그려두고 하이드레이션에서 갈아끼운다
  );
}

export default function EntryPage() {
  const hasBridge = useHasBridge();
  const [step, setStep] = useState<Step | null>(null);
  const [progress, setProgress] = useState<LaunchProgress>({ phase: "starting" });

  // 아직 아무것도 안 골랐으면 다리 유무가 시작점을 정한다
  const current: Step = step ?? (hasBridge ? "mode" : "web");

  /*
   * 진행 상황 구독. 백엔드가 **도중에 혼자 죽었을 때도** 여기로 온다 —
   * 그때 일렉트론이 창을 입구로 되돌리고 error를 쏘므로, 이 화면이 이유를 띄운다
   */
  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) return;
    return bridge.onProgress((next) => {
      setProgress(next);
      if (next.phase === "error") setStep("launching");
    });
  }, []);

  const launch = async (mode: LaunchMode, target: string) => {
    setProgress({ phase: "starting" });
    setStep("launching");
    // 성공하면 일렉트론이 창을 본 앱으로 넘긴다. 실패는 onProgress가 error로 알린다
    await getBridge()!.launch({ mode, target });
  };

  const compact = current !== "mode" && current !== "web";

  /*
   * ## 세로 구조 — 표지 한 장이 아니라 폼이 들어오면서 바뀌었다
   *
   * `h-full` + `justify-center`로는 **내용이 화면보다 길어지는 순간 위아래가 잘린다**
   * (연결 폼이 그렇다). `min-h-full`로 바꾸고 가운데 칸만 `flex-1`로 늘리면,
   * 짧을 때는 가운데 정렬이고 길 때는 자연스럽게 스크롤된다.
   * 바깥 레이아웃이 이미 `overflow-y-auto`라 여기서 더 할 일이 없다.
   *
   * 각주도 `absolute`에서 흐름 안으로 옮겼다 — 떠 있으면 긴 폼 위에 겹쳐 앉는다
   */
  return (
    <main className="flex min-h-full w-full flex-col py-10">
      <div className="page-x flex w-full flex-1 flex-col items-center justify-center text-center">
        {/*
          패널이 열리면 제목이 작아진다. 안 줄이면 15.5vw짜리 글자와 폼이 세로로
          겹쳐서 폰 폭에서는 버튼이 화면 밖으로 나간다
        */}
        <h1
          className={`font-display leading-none font-bold tracking-tighter text-white/90 drop-shadow-2xl transition-all duration-500 select-none ${
            compact
              ? "mb-8 text-[8vw] min-[860px]:text-[3.5vw]"
              : "text-[15.5vw] min-[860px]:text-[12vw]"
          }`}
        >
          STARLOG
        </h1>

        {!compact && (
          <p className="mb-16 max-w-2xl text-[12px] font-light text-white/60 sm:text-base md:text-lg">
            플레이한 게임을 기록하고 되돌아보는 개인 아카이브
          </p>
        )}

        <div className="flex w-full flex-col items-center">
          {current === "web" && (
            /*
              웹 폴백. 모드 선택은 일렉트론이 있어야 뜻이 있다 —
              브라우저에는 고를 세이브파일도, 띄울 백엔드도 없다
            */
            <Link href="/dashboard" className={BUTTON}>
              들어가기
            </Link>
          )}

          {current === "mode" && (
            <>
              <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-4">
                <button onClick={() => setStep("local")} className={BUTTON}>
                  로컬 모드
                </button>
                <button onClick={() => setStep("cloud")} className={BUTTON}>
                  클라우드 모드
                </button>
              </div>
              {/*
                데이터 폴더를 바꾸는 건 **DB 파일 위치가 바뀌는 일**이라 백엔드가 뜨기 전인
                여기여야 한다. 설정 화면에 두면 쓰고 있는 H2 파일 밑을 빼는 셈이 된다
              */}
              <DataRootLine />
            </>
          )}

          {current === "local" && (
            <SaveList onBack={() => setStep("mode")} onLaunch={(name) => launch("local", name)} />
          )}

          {current === "cloud" && (
            <ConnectionList onBack={() => setStep("mode")} onLaunch={(name) => launch("cloud", name)} />
          )}

          {current === "launching" && (
            <LaunchOverlay progress={progress} onRetry={() => setStep("mode")} />
          )}
        </div>
      </div>

      {/*
        출처 표기는 상세 화면이 아니라 여기 있는다 — 게임마다 반복될 정보가 아니라
        서비스 전체의 데이터 출처다. IGDB는 Twitch 개발자 약관상 표기가 필요하다
      */}
      <footer className="shrink-0 pt-10 text-center text-[11px] leading-relaxed text-white/30">
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

/**
 * 데이터 폴더 한 줄.
 *
 * 설정이 이것 하나뿐이라 화면을 따로 안 만든다 — 기본값이 앱데이터 안이라
 * 아무것도 안 건드려도 되고, HDD로 옮기고 싶을 때만 누른다.
 * 그러면 **세이브·백업·커버·스크린샷이 통째로 따라간다** (architecture §5)
 */
function DataRootLine() {
  const [root, setRoot] = useState<string | null>(null);

  useEffect(() => {
    getBridge()?.settings.get().then((s) => setRoot(s.dataRoot));
  }, []);

  const change = async () => {
    const picked = await getBridge()!.pickFolder();
    if (!picked) return;
    await getBridge()!.settings.setDataRoot(picked);
    setRoot(picked);
  };

  if (!root) return null;

  /*
   * 어두운 알약 위에 올린다 — 배경이 사용자 팔레트라 **밝은 색이 나오면 흰 글씨가 사라진다.**
   * 큰 제목은 drop-shadow로 버티지만 11px짜리 경로는 그걸로 안 된다
   */
  return (
    <div className="mt-10 flex max-w-full items-center gap-2 rounded-full bg-black/30 px-3.5 py-1.5 text-[11px] text-white/50 backdrop-blur-sm">
      <span className="shrink-0">데이터 폴더</span>
      <span className="truncate font-mono">{root}</span>
      <button
        onClick={change}
        className="shrink-0 underline underline-offset-2 transition-colors hover:text-white"
      >
        바꾸기
      </button>
    </div>
  );
}

const BUTTON =
  "whitespace-nowrap rounded-full border border-white/20 px-6 py-3 text-sm sm:px-8 font-medium tracking-widest uppercase transition-all duration-300 hover:bg-white hover:text-black";

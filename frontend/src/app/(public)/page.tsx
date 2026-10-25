"use client";

import Link from "next/link";
import SaveList from "@/components/entry/SaveList";
import BackupList from "@/components/entry/BackupList";
import ConnectionList from "@/components/entry/ConnectionList";
import EntryModeChoice from "@/components/entry/EntryModeChoice";
import LaunchOverlay from "@/components/entry/LaunchOverlay";
import { ENTRY_BUTTON } from "@/components/entry/entryButton";
import { useEntryFlow } from "@/components/entry/useEntryFlow";

/**
 * 입구 — v1.0의 **모드 선택** 화면 (architecture §1·§2).
 *
 * ## 이 화면만 백엔드가 없다
 *
 * 일렉트론이 `app://`로 **서버보다 먼저** 로드한다. 그래서 여기서는 `/api/*`를 부를 수
 * 없고, 필요한 일은 전부 `window.starlog`(preload)를 통한다.
 *
 * ## 브라우저에서 열면 예전 모습이다
 *
 * `npm run dev`에는 preload가 없어 `getBridge()`가 undefined다. 그때는 `[들어가기]`
 * 하나로 폴백한다 — **백엔드를 고칠 때 일렉트론을 거치지 않는 길**이 살아 있어야 한다.
 */
export default function EntryPage() {
  const { current, setStep, progress, cancelLaunch, backupTarget, setBackupTarget, session, resume, launch } =
    useEntryFlow();

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
            <Link href="/dashboard" className={ENTRY_BUTTON}>
              들어가기
            </Link>
          )}

          {current === "mode" && (
            <EntryModeChoice
              session={session}
              onResume={resume}
              onLocal={() => setStep("local")}
              onCloud={() => setStep("cloud")}
            />
          )}

          {current === "local" && (
            <SaveList
              onBack={() => setStep("mode")}
              onLaunch={(name) => launch("local", name)}
              onBackups={(name) => {
                setBackupTarget(name);
                setStep("backups");
              }}
            />
          )}

          {current === "backups" && backupTarget && (
            <BackupList
              saveName={backupTarget}
              onBack={() => setStep("local")}
              /* 되돌리면 새 세이브파일이 하나 생긴다 — 목록으로 돌려보내 그걸 보여준다 */
              onRestored={() => setStep("local")}
            />
          )}

          {current === "cloud" && (
            <ConnectionList onBack={() => setStep("mode")} onLaunch={(name) => launch("cloud", name)} />
          )}

          {current === "launching" && (
            <LaunchOverlay
              progress={progress}
              onRetry={() => setStep("mode")}
              onCancel={() => void cancelLaunch()}
              /*
                손상됐을 때만 뜨는 길. **실패한 그 세이브파일의 백업**으로 곧장 보낸다 —
                "백업에서 되돌리세요"라고만 하면 모드 고르기부터 다시 밟아야 하고,
                그 사이에 무엇을 되돌리려던 건지 잊는다
              */
              onRecover={
                progress.phase === "error" && progress.mode === "local" && progress.target
                  ? () => {
                      setBackupTarget(progress.target!);
                      setStep("backups");
                    }
                  : undefined
              }
            />
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

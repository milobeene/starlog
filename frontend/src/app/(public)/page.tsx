"use client";

import { takeAppPath } from "@/lib/lastAppPath";
import { clearApiCache } from "@/lib/useApi";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import SaveList from "@/components/entry/SaveList";
import BackupList from "@/components/entry/BackupList";
import DataRootDialog from "@/components/entry/DataRootDialog";
import ConnectionList from "@/components/entry/ConnectionList";
import LaunchOverlay from "@/components/entry/LaunchOverlay";
import { setBackendPort } from "@/lib/apiBase";
import { clearSessionCache } from "@/lib/session";
import {
  getBridge,
  type LaunchMode,
  type LaunchProgress,
  type SessionInfo,
} from "@/lib/desktop";

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
type Step = "web" | "mode" | "local" | "cloud" | "backups" | "launching";

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
  const router = useRouter();
  const hasBridge = useHasBridge();
  const [step, setStep] = useState<Step | null>(null);
  const [progress, setProgress] = useState<LaunchProgress>({ phase: "starting" });
  const [backupTarget, setBackupTarget] = useState<string | null>(null);
  /*
   * 지난번 붙었던 대상. `alive`면 백엔드가 아직 살아 있어서 **창만 옮기면 끝**이다
   * (입구로 나가도 안 죽인다 — 2026-08-28 결정). 앱을 새로 켰으면 alive가 false지만
   * 그래도 고르는 단계는 건너뛴다
   */
  const [session, setSession] = useState<SessionInfo | null>(null);

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

  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) return;
    let cancelled = false;
    bridge.session.current().then((found) => {
      if (!cancelled) setSession(found);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * 앱으로 들어간다.
   *
   * ## ⚠️ 일렉트론이 창을 옮기지 않는다 (2026-08-28)
   *
   * 예전엔 기동이 끝나면 일렉트론이 `win.loadURL("http://127.0.0.1:포트/dashboard")`로
   * **문서를 통째로 갈아끼웠다.** 그래서 검은 화면이 번쩍이고, 배경 연출이 처음부터
   * 다시 돌고, 진행 중이던 알림이 사라졌다.
   *
   * 이제 포트만 받아서 API 주소로 세우고 **같은 문서 안에서 라우팅**한다
   */
  const enter = (port: number | null | undefined) => {
    setBackendPort(port);
    /*
     * ⚠️ **`app://`가 아니면 통째로 옮긴다** (v1.2).
     *
     * 창은 평생 `app://` 한 장이라는 게 v1.0의 전제인데, 어떤 이유로든 창이
     * `http://127.0.0.1:포트`(스프링이 서빙하는 사본)에 가 있으면 **거기서 빠져나올 길이
     * 없다** — `router.push`는 지금 오리진 안에서 도는데, 세이브를 바꾸면 그 포트가
     * 죽어서 빈 화면이 되고 새로고침하면 검은 화면이 된다.
     *
     * 여기서 한 번 걸러주면 스스로 제자리로 돌아온다
     */
    if (typeof window !== "undefined" && window.location.protocol !== "app:") {
      window.location.href = "app://starlog/dashboard";
      return;
    }
    /*
     * ⚠️ **세션 캐시를 반드시 버린다** (2026-08-28).
     *
     * `lib/session.ts`는 `/api/me`를 한 번 받아 모듈에 들고 있는다. 예전엔 접속할 때마다
     * 문서가 통째로 다시 로드돼서 그게 저절로 사라졌는데, 이제는 문서가 안 바뀐다 —
     * **다른 세이브파일로 옮겨도 옛 프로필이 그대로 남는다.**
     * 헤더에는 앞 기록의 닉네임이, 프로필 화면에는 새로 받아온 닉네임이 떠서 둘이 어긋났다.
     * 배경색도 같은 값에서 나오므로 함께 틀어진다
     */
    clearSessionCache();
    /* ⚠️ 응답 캐시도 버린다 — 안 버리면 **남의 기록이 잠깐 보인다** (v1.2) */
    clearApiCache();
    router.push("/dashboard");
  };

  /**
   * 살아 있는 백엔드로 되돌아갈 때는 **나가기 전 화면으로** 간다 (2026-08-29).
   *
   * 세션 캐시는 안 버린다 — 같은 세이브파일로 돌아가는 것이라 프로필이 그대로다.
   * 오히려 버리면 헤더가 한 번 비었다 다시 채워진다
   */
  const resumeInto = (port: number | null | undefined) => {
    setBackendPort(port);
    router.push(takeAppPath());
  };

  /** 살아 있으면 즉시, 아니면 평소대로 기동. 어느 쪽이든 고르는 단계는 없다 */
  const resume = async () => {
    if (!session) return;
    if (session.alive) {
      const alive = await getBridge()!.session.resume();
      if (alive) {
        resumeInto(alive.port);
        return;
      }
    }
    launch(session.mode, session.target);
  };

  const launch = async (mode: LaunchMode, target: string) => {
    setProgress({ phase: "starting" });
    setStep("launching");
    /*
     * 실패는 대개 `onProgress`가 error로 알린다.
     *
     * ⚠️ **하지만 IPC가 예외를 던지는 길이 따로 있다** — 이름 규칙에 안 맞는 세이브파일
     * (탐색기에서 손으로 바꾼 이름)이면 `assertSaveName`이 던진다. 그때는 `progress`가
     * 영영 안 와서 **로딩 화면이 안 걷혔다.** 잡아서 같은 error 갈래로 합친다
     */
    try {
      const result = await getBridge()!.launch({ mode, target });
      if (result?.ok) enter(result.port);
    } catch (e) {
      setProgress({
        phase: "error",
        code: "LAUNCH_REFUSED",
        message: e instanceof Error ? e.message : String(e),
      });
    }
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
              {/*
                **[최근 접속]이 첫 자리다.** 매번 모드를 고르고 목록에서 찾는 게 실제로
                제일 귀찮은 부분이었다. 살아 있으면 즉시, 아니면 5초 — 어느 쪽이든
                고르는 단계가 없다
              */}
              {session && (
                <button
                  onClick={resume}
                  className={`${BUTTON} group mb-4 border-white/45`}
                >
                  {/*
                    **두 겹을 같은 칸에 포갠다** (사용자 아이디어). 글자를 접었다 폈다 하는
                    앞의 두 방식은 폭이 흔들리거나 이름이 잘렸다. 겹쳐두면 박스가 둘 중
                    넓은 쪽에 맞춰 **한 번 정해지고 안 움직인다** — 가운데 정렬도 공짜다
                  */}
                  <span className="entry-recent">
                    <span className="entry-rest">
                      최근 접속 · {session.target}
                      {/*
                        ⚠️ `text-white/45`를 쓰면 **호버해도 흰색 그대로다** — 부모의
                        `hover:text-black`은 상속인데 여기서 색을 직접 정해버려 이기지 못한다.
                        투명도만 낮추면 부모가 정한 색을 따라간다
                      */}
                      <span className="opacity-55 normal-case">({session.mode === "local" ? "세이브파일" : "데이터베이스"})</span>
                    </span>

                    <span className="entry-hover" aria-hidden>
                      {session.target}
                      <span className="entry-arrow">
                        <span className="entry-arrow-line" />
                        <svg
                          className="entry-arrow-head"
                          viewBox="0 0 6 12"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          {/* 왼쪽 끝까지 당긴다 — 선과 머리 사이에 틈이 안 남게 */}
                          <path d="M0.4 1.6 L5 6 L0.4 10.4" />
                        </svg>
                      </span>
                    </span>
                  </span>
                </button>
              )}

              <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-4">
                {/*
                  이름을 바꿨다 (2026-08-28). "로컬/클라우드"는 **어디 있나**를 말하는데
                  사용자가 알아야 하는 건 **그게 뭔가**다. 게다가 오른쪽은 자기 서버여도 되니
                  "클라우드"가 부정확하기도 했다. 설명은 안 붙인다 — 화면이 지저분해진다
                */}
                <button onClick={() => setStep("local")} className={BUTTON}>
                  로컬 세이브파일
                </button>
                <button onClick={() => setStep("cloud")} className={BUTTON}>
                  데이터베이스 연결
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

/**
 * 데이터 폴더 한 줄.
 *
 * 설정이 이것 하나뿐이라 화면을 따로 안 만든다 — 기본값이 앱데이터 안이라
 * 아무것도 안 건드려도 되고, HDD로 옮기고 싶을 때만 누른다.
 * 그러면 **세이브·백업·커버·스크린샷이 통째로 따라간다** (architecture §5)
 */
function DataRootLine() {
  const [root, setRoot] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    getBridge()?.settings.get().then((s) => setRoot(s.dataRoot));
  }, []);

  if (!root) return null;

  /*
   * 모드 버튼과 같은 재질로 맞춘다 (2026-08-28). 검은 알약 하나만 다른 톤이라
   * **혼자 튀어 보였다** — 배경이 밝아도 읽히게 하려던 건데 재질이 어긋나는 값이 더 컸다.
   * 대신 글자를 키우고 흰 테두리를 줘서 대비를 확보한다
   */
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mt-10 flex max-w-full items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-[11px] text-white/60 transition-all duration-300 hover:border-white/40 hover:text-white"
      >
        <FolderIcon />
        <span className="shrink-0">데이터 폴더</span>
        <span className="max-w-[40vw] truncate font-mono text-white/40">{root}</span>
      </button>

      {open && (
        <DataRootDialog
          current={root}
          onClose={() => setOpen(false)}
          onChanged={setRoot}
        />
      )}
    </>
  );
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
         className="h-3.5 w-3.5 shrink-0 opacity-70">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </svg>
  );
}

const BUTTON =
  "whitespace-nowrap rounded-full border border-white/20 px-6 py-3 text-sm sm:px-8 font-medium tracking-widest uppercase transition-all duration-300 hover:bg-white hover:text-black";

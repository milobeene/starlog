"use client";

import { takeAppPath } from "@/lib/lastAppPath";
import { clearApiCache } from "@/lib/useApi";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { setBackendPort } from "@/lib/apiBase";
import { clearSessionCache } from "@/lib/session";
import {
  bridgeMessage,
  getBridge,
  type LaunchMode,
  type LaunchProgress,
  type SessionInfo,
} from "@/lib/desktop";

export type Step = "web" | "mode" | "local" | "cloud" | "backups" | "launching";

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

/**
 * 입구의 흐름 — 어느 단계인가, 진행 상황, 지난번 접속, 그리고 앱으로 들어가는 길.
 * 화면(`EntryPage`)은 단계에 맞는 패널을 고르기만 한다
 */
export function useEntryFlow() {
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

  /** [취소]를 누른 기동. 그 뒤에 돌아온 답은 버린다 — 이미 모드 선택으로 돌아왔다 */
  const canceled = useRef(false);

  /*
   * 진행 상황 구독 + **앱 안에서 서버가 죽은 이유** (2026-10-25).
   *
   * 앱 안에서 죽으면 일렉트론이 "입구로 가라"와 error를 함께 쏘는데, 그 순간 이 화면은 아직 없다 —
   * 라우팅이 끝나야 마운트되고 그제야 구독이 붙는다. 그래서 이유 없는 입구만 남았다.
   * 일렉트론이 그 오류를 들고 있다가 여기서 마운트될 때 가져간다. 구독 중에 받은 것도 가져가 지운다 —
   * 안 지우면 다음에 입구로 올 때 옛 오류가 또 뜬다
   */
  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) return;
    const unsubscribe = bridge.onProgress((next) => {
      if (canceled.current) return;
      setProgress(next);
      if (next.phase === "error") {
        setStep("launching");
        void bridge.takeLaunchError?.();
      }
    });
    let cancelled = false;
    bridge.takeLaunchError?.().then((found) => {
      if (cancelled || !found) return;
      setProgress(found);
      setStep("launching");
    }).catch(() => {});
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  /*
   * 지난 접속은 **모드 선택으로 돌아올 때마다** 다시 받는다 (2026-10-25). 마운트 때 한 번만 받으면
   * 세이브 목록에서 지우거나 이름을 바꾼 뒤 [뒤로]로 와도 옛 이름이 남았고, 누르면 그 이름으로 빈 세이브가 생겼다
   */
  useEffect(() => {
    const bridge = getBridge();
    if (!bridge || current !== "mode") return;
    let cancelled = false;
    bridge.session.current().then((found) => {
      if (!cancelled) setSession(found);
    }).catch(() => {
      if (!cancelled) setSession(null);
    });
    return () => {
      cancelled = true;
    };
  }, [current]);

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
  const enter = (port: number | null | undefined, reload = false) => {
    setBackendPort(port);
    // CSP는 문서를 받을 때 정해진다 — 문서보다 늦게 생긴 연결의 스토리지 주소는 새로 받아야 열린다
    if (reload && typeof window !== "undefined") {
      window.location.href = "app://starlog/dashboard";
      return;
    }
    /*
     * ⚠️ **`app://`가 아니면 통째로 옮긴다** (v1.2).
     *
     * 창은 평생 `app://` 한 장이라는 게 v1.0의 전제인데, 어떤 이유로든 창이
     * `http://127.0.0.1:포트`(서버가 서빙하는 사본)에 가 있으면 **거기서 빠져나올 길이
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
  const resumeInto = (port: number | null | undefined, reload = false) => {
    setBackendPort(port);
    if (reload && typeof window !== "undefined") {
      window.location.href = takeAppPath();
      return;
    }
    router.push(takeAppPath());
  };

  /** 살아 있으면 즉시, 아니면 평소대로 기동. 어느 쪽이든 고르는 단계는 없다 */
  const resume = async () => {
    if (!session) return;
    if (session.alive) {
      const alive = await getBridge()!.session.resume();
      if (alive) {
        resumeInto(alive.port, alive.reload);
        return;
      }
    }
    launch(session.mode, session.target, true);
  };

  /**
   * @param resume [최근 접속]에서 왔다 — 없어진 세이브를 같은 이름의 빈 세이브로 만들지 않게 일렉트론에 알린다
   */
  const launch = async (mode: LaunchMode, target: string, resume = false) => {
    canceled.current = false;
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
      const result = await getBridge()!.launch({ mode, target, ...(resume ? { resume } : {}) });
      if (canceled.current || result?.code === "SUPERSEDED") return;
      if (result?.ok) enter(result.port, result.reload);
    } catch (e) {
      if (canceled.current) return;
      setProgress({
        phase: "error",
        code: "LAUNCH_REFUSED",
        message: bridgeMessage(e, "기동하지 못했습니다"),
      });
    }
  };

  /**
   * 기동 대기 중의 [취소]. 띄우던 서버를 내리고 모드 선택으로 돌아간다.
   * 일렉트론이 먼저 이 기동을 낡은 것으로 만들므로 늦게 온 "ready"·오류는 무시된다
   */
  const cancelLaunch = async () => {
    canceled.current = true;
    setStep("mode");
    try {
      await getBridge()?.cancelLaunch?.();
    } catch {
      /* 내리지 못했으면 다음 기동이 먼저 내린다 */
    }
  };

  return {
    current,
    setStep,
    progress,
    cancelLaunch,
    backupTarget,
    setBackupTarget,
    session,
    resume,
    launch,
  };
}

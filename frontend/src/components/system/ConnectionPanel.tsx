"use client";

import { useEffect, useState } from "react";
import ConnectionDialog from "@/components/entry/ConnectionDialog";
import { IgdbSettings } from "@/components/system/AppSettingsPanel";
import { getBridge, type ConnectionProfile, type SessionInfo } from "@/lib/desktop";

/**
 * 지금 붙어 있는 연결 (2026-08-28에 목록 → 단일 폼으로).
 *
 * ## 왜 목록이 아닌가
 *
 * **앱 안에서는 연결이 언제나 하나다** — 지금 그걸로 접속해 있으니까.
 * 목록으로 두면 한 줄짜리 표를 만들고 그걸 또 눌러 들어가야 했다.
 * 여기서는 바로 그 연결의 폼을 편다. 나가려면 탭을 옮기면 된다.
 *
 * ## 고쳐도 지금 세션에는 안 먹는다
 *
 * DataSource·스토리지는 **부팅할 때 조립된다**(architecture §2). 그래서 여기서 바꾼 값은
 * 다음에 그 연결로 들어올 때부터 적용되고, 화면이 그걸 분명히 말해야 한다
 */
export default function ConnectionPanel() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [profile, setProfile] = useState<ConnectionProfile | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) return;
    bridge.session.current().then(async (found) => {
      setSession(found);
      if (found?.mode !== "cloud") return;
      const list = await bridge.connections.list();
      setProfile(list.find((p) => p.name === found.target) ?? null);
    });
  }, []);

  if (!getBridge()) {
    return (
      <Notice>
        연결 설정은 데스크탑 앱에서만 볼 수 있습니다. 자격증명이 앱 폴더의 파일에 있고, 웹에서는
        그 파일에 닿을 수 없습니다.
      </Notice>
    );
  }

  /*
   * 로컬 세이브파일에는 **데이터베이스 연결 설정이 없다.** 대신 IGDB 키를 여기 둔다 —
   * 클라우드는 연결 설정 폼 안에 IGDB 칸이 있으므로, 두 모드 모두 "연결" 탭 하나에서
   * 키를 관리하게 된다 (2026-08-28). 예전엔 "앱 설정" 탭에도 같은 칸이 있어 두 군데였다
   */
  if (session && session.mode !== "cloud") {
    return (
      <div className="flex flex-col gap-4">
        <Notice>
          지금은 로컬 세이브파일로 쓰고 계십니다. 데이터베이스 연결 설정은 입구 화면에서
          관리합니다.
        </Notice>
        <IgdbSettings />
      </div>
    );
  }

  if (!profile) {
    return <div className="h-40 skeleton-sweep rounded-lg bg-white/[0.06]" />;
  }

  return (
    <div className="flex flex-col gap-4">
      {/*
        **안내를 한 곳에 모은다.** 예전엔 이 경고가 맨 위, 저장 결과가 그 아래, 테스트 결과가
        폼 한가운데에 있어서 방금 누른 것의 답이 어디 있는지 알 수가 없었다.
        지금은 경고만 위에 있고 나머지는 전부 버튼 옆(폼 아래)에 모인다
      */}
      <p className="rounded-md border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2.5 text-[11px] leading-relaxed text-amber-200/80">
        여기서 고친 값은 <b className="text-amber-100">다음에 이 연결로 들어올 때</b>부터
        적용됩니다. 데이터베이스와 스토리지는 앱이 시작할 때 한 번 연결되기 때문입니다 —
        지금 보고 계신 화면은 그대로 씁니다.
      </p>

      {/*
        팝업이 아니라 **탭 안에 그대로 편다.** 앱 안에서는 연결이 하나뿐이라
        고르는 단계가 없고, 나가려면 탭을 옮기면 된다 — 취소 버튼이 필요 없다
      */}
      <ConnectionDialog
        initial={profile}
        inline
        notice={saved ? "저장했습니다. 다음에 이 연결로 들어오실 때부터 적용됩니다." : null}
        onClose={() => {}}
        onSaved={(next) => {
          setProfile(next);
          setSaved(true);
        }}
      />
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-white/10 bg-white/5 px-4 py-6 text-sm leading-relaxed text-white/45">
      {children}
    </p>
  );
}

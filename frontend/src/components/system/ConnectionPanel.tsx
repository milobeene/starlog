"use client";

import { useEffect, useRef, useState } from "react";
import ConnectionDialog from "@/components/entry/ConnectionDialog";
import { Button } from "@/components/ui/Field";
import { IgdbSettings, TranslationSettings, type SectionHandle } from "@/components/system/AppSettingsPanel";
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
/**
 * 로컬 세이브파일의 연결 탭 (2026-08-29).
 *
 * 클라우드 모드와 **할 수 있는 것을 같게 맞췄다** — 섹션마다 [테스트]·[저장]이 있고
 * 맨 아래 [전체 테스트]·[전체 저장]이 있다. 예전엔 번역에 테스트가 아예 없었고
 * 전체 버튼도 없어서, 같은 앱 안에서 모드에 따라 할 수 있는 일이 달랐다.
 *
 * 섹션의 동작을 `register`로 받아 순서대로 부른다 — 상태를 여기로 끌어올리면
 * 섹션 둘이 한 덩어리로 엉킨다
 */
function LocalConnectionSettings() {
  const igdb = useRef<SectionHandle | null>(null);
  const translate = useRef<SectionHandle | null>(null);
  const [busy, setBusy] = useState(false);

  const runAll = async (pick: (h: SectionHandle) => () => Promise<void>) => {
    setBusy(true);
    try {
      // 하나가 실패해도 다음은 돈다 — 결과는 각 섹션의 알림이 따로 말한다
      for (const ref of [igdb, translate]) {
        if (ref.current) {
          await pick(ref.current)().catch(() => {});
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Notice>
        지금은 로컬 세이브파일로 쓰고 계십니다. 데이터베이스 연결 설정은 입구 화면에서
        관리합니다.
      </Notice>
      <IgdbSettings register={(h) => (igdb.current = h)} />
      <TranslationSettings register={(h) => (translate.current = h)} />

      <div className="flex items-center gap-3 border-t border-white/8 pt-5">
        <Button onClick={() => runAll((h) => h.test)} disabled={busy}>
          전체 테스트
        </Button>
        <Button variant="primary" onClick={() => runAll((h) => h.save)} disabled={busy}>
          전체 저장
        </Button>
      </div>
    </div>
  );
}

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
    return <LocalConnectionSettings />;
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

      {/*
        ⚠️ **여기에 번역 섹션을 또 두지 않는다** (2026-08-28 제거).
        위 연결 설정 폼 안에 이미 번역 키 칸이 있어서 **같은 것이 두 군데**가 됐다 —
        IGDB에서 똑같은 실수를 했다가 고친 적이 있다. 클라우드는 연결 폼 하나로 끝낸다
      */}
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

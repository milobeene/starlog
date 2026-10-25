"use client";

import { useEffect, useState } from "react";
import ConnectionDialog from "@/components/entry/ConnectionDialog";
import { CoverTargetChoice, Section } from "@/components/entry/ConnectionFormParts";
import { Button } from "@/components/ui/Field";
import { api, errorMessage } from "@/lib/api";
import { getBridge, type ConnectionProfile, type CoverTarget, type SecretFieldPath, type SessionInfo } from "@/lib/desktop";

/**
 * 로컬 세이브파일의 연결 탭 (v1.2에서 클라우드와 **한 컴포넌트로 합침**).
 *
 * 예전엔 로컬 전용 화면을 따로 뒀는데, **같은 일을 하는 화면 둘이 서로 다르게 생겼다** —
 * 버튼 위치도, 알림도, 사용량 게이지 유무도 달랐다. 이제 `ConnectionDialog` 하나가
 * `mode="local"`로 DB·스토리지 섹션만 감추고 나머지는 그대로 쓴다.
 *
 * ⚠️ 저장 경로는 갈린다 — 로컬은 `connections.json`이 없어 IGDB·번역을 `app_setting`에
 * 바로 넣는다. 그 분기는 다이얼로그 안에 있다(경계는 "재시작이 필요한가", architecture §2)
 */
function LocalConnectionSettings() {
  const [initial, setInitial] = useState<ConnectionProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    /*
     * 지금 세이브의 IGDB·번역 키를 **가린 채로** 받아 폼의 초기값으로 쓴다 (2026-10-25).
     * 예전엔 탭을 여는 즉시 `reveal`로 원문을 받아 상태에 넣었다 — 눈 버튼을 누를 때만 원문이라는
     * 설계(결정 63)와 어긋났다. 가린 값을 그대로 저장·시험하면 서버가 저장된 원문으로 바꿔 쓴다
     */
    let cancelled = false;
    api
      .get<{
        igdbClientId: string | null;
        igdbClientSecret: string | null;
        hasIgdbClientSecret: boolean;
        translateApiKey: string | null;
        hasTranslateApiKey: boolean;
      }>("/api/system/settings")
      .then((found) => {
        if (cancelled) return;
        setError(null);
        setInitial({
          name: "",
          db: { url: "", user: "", password: "", schema: "" },
          storage: { endpoint: "", bucket: "", accessKey: "", secretKey: "", publicBaseUrl: "" },
          igdb: { clientId: found.igdbClientId ?? "", clientSecret: found.igdbClientSecret ?? "" },
          translate: { apiKey: found.translateApiKey ?? "" },
          hasSecret: {
            "igdb.clientSecret": found.hasIgdbClientSecret,
            "translate.apiKey": found.hasTranslateApiKey,
          },
        });
      })
      // 거부되면 스켈레톤이 영원히 돌았다 — 이유와 [다시 시도]를 보여준다
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e, "설정을 불러오지 못했습니다."));
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  /** 눈 버튼 — 그 칸 하나의 원문만 서버에서 받는다 */
  const reveal = async (path: SecretFieldPath) => {
    const found = await api.post<{ igdbClientSecret: string | null; translateApiKey: string | null }>(
      "/api/system/settings/reveal",
    );
    if (path === "igdb.clientSecret") return found.igdbClientSecret ?? "";
    if (path === "translate.apiKey") return found.translateApiKey ?? "";
    return null;
  };

  if (error) {
    return (
      <Problem message={error}>
        <Button onClick={() => setAttempt((n) => n + 1)}>다시 시도</Button>
      </Problem>
    );
  }
  if (!initial) return <div className="h-40 skeleton-sweep rounded-lg bg-white/[0.06]" />;

  return (
    <div className="flex flex-col gap-4">
      <Notice>
        지금은 로컬 세이브파일로 쓰고 계십니다. 데이터베이스 연결 설정은 입구 화면에서
        관리합니다.
      </Notice>
      <LocalCoverTarget />
      <ConnectionDialog
        initial={initial}
        inline
        mode="local"
        reveal={reveal}
        onClose={() => {}}
        onSaved={() => {}}
      />
    </div>
  );
}

/**
 * 로컬 세이브의 커버 위치 (2026-10-25). **세이브마다가 아니라 로컬 세이브 전부에 하나**다 —
 * `settings.json`에 있고 서버는 기동 때 읽는다(클라우드 연결의 같은 칸과 같은 길). 로컬에는 스토리지가 없다.
 * 고르는 즉시 저장한다 — 값 하나라 [저장] 단계를 두면 눌렀는지 헷갈리기만 한다
 */
function LocalCoverTarget() {
  const [value, setValue] = useState<CoverTarget | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const bridge = getBridge();

  useEffect(() => {
    let cancelled = false;
    getBridge()
      ?.settings.get()
      .then((s) => {
        if (!cancelled) setValue(s.localCoverTarget ?? "db");
      })
      .catch((e) => {
        if (!cancelled) setMessage({ ok: false, text: errorMessage(e, "설정을 읽지 못했습니다.") });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 옛 일렉트론(preload에 칸이 없다)이면 고를 수 없다 — 숨긴다
  if (!bridge?.settings.setLocalCoverTarget) return null;

  const choose = async (next: CoverTarget) => {
    if (next === "storage" || next === value) return;
    const before = value;
    setValue(next);
    try {
      await bridge.settings.setLocalCoverTarget!(next);
      setMessage({ ok: true, text: "저장했습니다. 다음에 세이브를 여실 때부터 적용됩니다." });
    } catch (e) {
      setValue(before);
      setMessage({ ok: false, text: errorMessage(e, "저장하지 못했습니다.") });
    }
  };

  return (
    <Section title="커버" hint="로컬 세이브 전부에 적용됩니다. 이미 올린 커버는 있던 자리 그대로 읽힙니다.">
      {value === null ? (
        <div className="h-16 skeleton-sweep rounded-md bg-white/[0.06]" />
      ) : (
        <CoverTargetChoice value={value} onChange={choose} storageNote="로컬 세이브에는 스토리지가 없습니다" />
      )}
      {message && (
        <span className={`text-[11px] ${message.ok ? "text-emerald-300/80" : "text-red-400"}`}>
          {message.ok ? "✓ " : "✕ "}
          {message.text}
        </span>
      )}
    </Section>
  );
}

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
 * DB 연결·스토리지는 **부팅할 때 조립된다**(architecture §2). 그래서 여기서 바꾼 값은
 * 다음에 그 연결로 들어올 때부터 적용되고, 화면이 그걸 분명히 말해야 한다
 *
 * ## 이름을 바꿔도 된다 (2026-10-25)
 *
 * 일렉트론이 지금 세션과 [최근 접속]을 새 이름으로 옮긴다. 예전엔 옛 이름을 들고 있어서
 * 탭을 다시 열면 프로필을 못 찾아 스켈레톤이 영원히 돌았다
 */
export default function ConnectionPanel() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [profile, setProfile] = useState<ConnectionProfile | null>(null);
  /** 찾지 못했거나 읽지 못했다 — 스켈레톤을 영원히 돌리지 않고 이유와 입구로 가는 길을 보여준다 */
  const [missing, setMissing] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) return;
    bridge.session
      .current()
      .then(async (found) => {
        setSession(found);
        if (found?.mode !== "cloud") return;
        const list = await bridge.connections.list();
        const mine = list.find((p) => p.name === found.target) ?? null;
        setProfile(mine);
        if (!mine) setMissing(`지금 접속한 연결(${found.target})의 설정을 찾지 못했습니다. 입구에서 지웠거나 이름을 바꾼 것 같습니다.`);
      })
      .catch((e) => setMissing(errorMessage(e, "연결 설정을 읽지 못했습니다.")));
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

  if (missing) {
    return (
      <Problem message={missing}>
        <Button onClick={() => void getBridge()?.backToEntry()}>입구로</Button>
      </Problem>
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

      {/*
        ⚠️ **여기에 번역 섹션을 또 두지 않는다** (2026-08-28 제거).
        위 연결 설정 폼 안에 이미 번역 키 칸이 있어서 **같은 것이 두 군데**가 됐다 —
        IGDB에서 똑같은 실수를 했다가 고친 적이 있다. 클라우드는 연결 폼 하나로 끝낸다
      */}
    </div>
  );
}

function Problem({ message, children }: { message: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-red-400/20 bg-red-400/[0.05] px-4 py-5">
      <p className="text-sm leading-relaxed text-red-300/90">{message}</p>
      {children}
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

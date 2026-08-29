"use client";

import { useEffect, useState } from "react";
import SecretField from "@/components/entry/SecretField";
import { Button } from "@/components/ui/Field";
import { api, errorMessage } from "@/lib/api";
import { closeTask, putTask, updateTask } from "@/lib/tasks";
import { getBridge } from "@/lib/desktop";
import DesktopSection from "@/components/settings/DesktopSection";

/**
 * 앱 설정 (2026-08-28).
 *
 * ## IGDB 키가 왜 여기 있나
 *
 * architecture §2의 경계표대로다 — **기준은 "재시작이 필요한가"**. DB·스토리지는 부팅 때
 * 조립되므로 일렉트론(입구 화면)이 갖고, **IGDB는 런타임에 바꿔도 되므로 앱 안**이다.
 *
 * 그런데 그 자리를 안 만들어서 키가 연결 설정에만 있었고, 결과적으로
 * **로컬 세이브파일에서는 게임 검색을 아예 못 썼다.** 여기가 그 자리다.
 *
 * ## 값은 DB에 들어간다
 *
 * 그래서 세이브파일을 옮기면 키도 함께 간다 — 이 기록에 딸린 설정이지 사람에 딸린 게 아니다.
 * 저장하면 **다시 띄우지 않고 바로** 먹는다
 */
type Settings = { igdbClientId: string; igdbClientSecret: string; fromBootConfig: boolean };
type TestResult = { ok: boolean; tokenIssued: boolean; searchWorks: boolean; message: string };

/**
 * IGDB 키 — **로컬 세이브파일 전용이다** (2026-08-28에 자리를 옮김).
 *
 * 예전엔 "앱 설정" 탭에 있었는데, 데이터베이스 연결에는 **연결 설정 안에 IGDB 칸이 따로** 있어
 * 같은 것이 두 군데 있었다. 어느 쪽이 이기는지 화면만 봐서는 알 수가 없다.
 *
 * 그래서 **한 곳으로 모았다** — 둘 다 "연결" 탭이다. 클라우드는 연결 설정 폼 안에,
 * 로컬은 이 컴포넌트로. 로컬은 연결 설정이라는 게 없으니 자리가 겹치지 않는다
 */
/**
 * 섹션이 자기 동작을 위로 넘긴다 (2026-08-29).
 *
 * 로컬 모드의 [전체 테스트]·[전체 저장]이 이걸 모아 순서대로 부른다.
 * 값이 자식 안에 있어서 부모가 직접 못 부르는데, 상태를 위로 끌어올리면
 * 섹션 둘이 부모 하나에 엉킨다 — **동작만 넘기는 게 덜 엉킨다**
 */
export type SectionHandle = { test: () => Promise<void>; save: () => Promise<void> };

export function IgdbSettings({ register }: { register?: (h: SectionHandle) => void } = {}) {
  const [loaded, setLoaded] = useState<Settings | null>(null);
  const [id, setId] = useState("");
  const [secret, setSecret] = useState("");
  const [testing, setTesting] = useState(false);
  /** 저장 가능 여부만 본다 — 보여주는 건 알림이 한다 */
  const [passed, setPassed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGaps, setShowGaps] = useState(false);

  useEffect(() => {
    api.get<Settings>("/api/system/settings").then((s) => {
      setLoaded(s);
      setId(s.igdbClientId ?? "");
      setSecret(s.igdbClientSecret ?? "");
    });
  }, []);

  const filled = Boolean(id.trim()) && Boolean(secret.trim());
  const halfFilled = (Boolean(id.trim()) || Boolean(secret.trim())) && !filled;
  const canSave = filled && passed;

  const change = (setter: (v: string) => void) => (value: string) => {
    setter(value);
    setPassed(false);   // 값이 바뀌면 옛 결과는 거짓말이 된다
    setSaved(false);
  };

  /** 결과는 알림 한 곳에 모은다 — 연결 테스트와 같은 규칙이다 */
  const test = async () => {
    if (!filled) {
      setShowGaps(true);
      return;
    }
    setTesting(true);
    setError(null);
    setPassed(false);
    putTask({
      id: "connection-test",
      kind: "connection-test",
      title: "IGDB 확인 중",
      progress: { done: 0, total: 0 },
    });
    try {
      const found = await api.post<TestResult>("/api/system/settings/igdb/test", {
        clientId: id,
        clientSecret: secret,
      });
      setPassed(found.ok);
      updateTask("connection-test", {
        title: `IGDB — ${found.ok ? "연결됨" : "연결 실패"}`,
        progress: undefined,
        actions: found.ok
          ? [{
              label: "저장",
              primary: true,
              run: async () => {
                await api.put("/api/system/settings/igdb", { clientId: id, clientSecret: secret });
                setSaved(true);
                closeTask("connection-test");
              },
            }]
          : undefined,
        result: {
          ok: found.ok,
          lines: [
            { ok: found.tokenIssued, label: "키 확인" },
            { ok: found.searchWorks, label: "게임 검색" },
          ],
          message: found.message,
        },
      });
    } catch (caught) {
      setError(errorMessage(caught, "확인하지 못했습니다."));
      updateTask("connection-test", {
        title: "IGDB 확인 실패",
        progress: undefined,
        result: { ok: false, message: errorMessage(caught, "확인하지 못했습니다.") },
      });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    if (!canSave) {
      setShowGaps(true);
      return;
    }
    try {
      await api.put("/api/system/settings/igdb", { clientId: id, clientSecret: secret });
      setSaved(true);
    } catch (caught) {
      setError(errorMessage(caught, "저장하지 못했습니다."));
    }
  };

  useEffect(() => {
    register?.({ test, save });
  });

  if (!loaded) return <div className="h-40 skeleton-sweep rounded-lg bg-white/[0.06]" />;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div>
          <h3 className="text-[11px] font-semibold tracking-widest text-white/50 uppercase">
            IGDB
          </h3>
          <p className="mt-1 text-[11px] leading-relaxed text-white/30">
            게임 검색에 쓰는 외부 데이터베이스입니다. 비워두시면 검색 대신 직접 등록으로 쓰실 수
            있습니다.
            <br />
            저장하시면 앱을 다시 켜지 않아도 바로 적용됩니다.
          </p>
          {loaded.fromBootConfig && loaded.igdbClientId && (
            <p className="mt-2 text-[11px] text-white/25">
              지금 값은 설정 파일에서 읽은 것입니다. 저장하시면 이 기록에 함께 보관됩니다.
            </p>
          )}
        </div>

        <fieldset disabled={testing} className={testing ? "opacity-50" : undefined}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="flex items-baseline gap-1.5">
                <span
                  className={`text-[10px] font-semibold tracking-widest uppercase ${
                    showGaps && !id.trim() ? "text-red-400" : "text-white/40"
                  }`}
                >
                  클라이언트 ID
                </span>
                <span className="font-mono text-[10px] text-white/20">client-id</span>
              </span>
              <input
                value={id}
                onChange={(e) => change(setId)(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                className={`w-full rounded-md border bg-white/5 px-3 py-2 text-sm text-white transition-colors focus:bg-white/10 focus:outline-none ${
                  showGaps && !id.trim() ? "border-red-500/60" : "border-white/10 focus:border-white/30"
                }`}
              />
            </label>
            <SecretField
              label="클라이언트 시크릿"
              keyName="client-secret"
              value={secret}
              onChange={change(setSecret)}
              bad={showGaps && !secret.trim()}
            />
          </div>
        </fieldset>

        {halfFilled && showGaps && (
          <p className="text-[11px] text-red-400">
            둘 다 채우거나 둘 다 비워 주세요. 반만 채우면 조용히 실패합니다.
          </p>
        )}


        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-auto text-[11px] text-white/35">
            {testing
              ? "확인 중입니다. 다른 화면에 다녀오셔도 됩니다"
              : saved
                ? "저장했습니다. 바로 적용됩니다."
                : canSave
                  ? ""
                  : filled
                    ? "연결 테스트를 통과해야 저장할 수 있습니다"
                    : "두 칸을 모두 채워 주세요"}
          </span>
          <Button onClick={test} disabled={testing}>
            {testing ? "확인 중…" : "연결 테스트"}
          </Button>
          <Button variant="primary" onClick={save} disabled={testing}>
            저장
          </Button>
        </div>
      </section>
    </div>
  );
}

/**
 * 앱 설정 탭 (2026-08-28 재구성).
 *
 * IGDB는 여기서 뺐다 — 연결 설정에도 같은 칸이 있어 **두 군데가 됐기 때문**이다.
 * 대신 프로필에 있던 "데이터 옮기기"를 가져왔다: 세이브파일과 데이터베이스를 오가는 일은
 * 프로필(내 이름·배경색)보다 **앱 층위**에 가깝다
 */
export default function AppSettingsPanel() {
  return (
    <div className="flex flex-col gap-8">
      <DataFolder />
      <DesktopSection />
    </div>
  );
}

/**
 * 데이터 폴더 — **열기만 준다.**
 *
 * 경로를 바꾸는 건 DB 파일 위치가 바뀌는 일이라 입구에 있어야 한다(백엔드가 뜨기 전).
 * 여기서는 "지금 어디에 쌓이고 있나"를 보여주고 열어주기만 한다
 */
function DataFolder() {
  const [dirs, setDirs] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    getBridge()?.settings.get().then((s) => setDirs(s.dirs));
  }, []);

  if (!getBridge()) return null;

  return (
    <section className="flex flex-col gap-3 border-t border-white/8 pt-6">
      <div>
        <h3 className="text-[11px] font-semibold tracking-widest text-white/50 uppercase">
          데이터 폴더
        </h3>
        <p className="mt-1 font-mono text-[11px] break-all text-white/40">{dirs?.root ?? "…"}</p>
        <p className="mt-1.5 text-[11px] text-white/25">
          위치를 바꾸시려면 입구 화면에서 설정해 주세요. 데이터베이스 파일이 열려 있는 동안에는
          옮길 수 없습니다.
        </p>
      </div>
      <div>
        <Button onClick={() => getBridge()!.openFolder("root")}>폴더 열기</Button>
      </div>
    </section>
  );
}


/* ─────────────────────────────────────────────────────────────── */

type TranslationUsage = {
  usedChars: number;
  guardChars: number;
  freeChars: number;
  remainingChars: number;
};
type TranslateSettings = { translateApiKey: string | null; translation: TranslationUsage };

/**
 * 번역 키 (2026-08-28).
 *
 * ## ⚠️ 여기만 넘으면 돈이 나간다
 *
 * IGDB도 스토리지도 한도를 넘으면 거절당하고 끝이다. 구글의 "월 50만 자 무료"는
 * **여기까지 청구 안 함**이지 **여기서 멈춤**이 아니다 — 한 자만 넘어도 초과분이 청구된다.
 * 그래서 사용량을 키 칸 **바로 옆에** 둔다. 다른 탭에 있으면 넣을 때 안 본다.
 *
 * ## 연결 테스트가 없다
 *
 * IGDB에는 있는데 여기 없는 이유 — **시험 삼아 한 번 부르는 것도 글자를 쓰고, 그게 곧 돈이다.**
 * 키가 틀렸는지는 실제로 번역할 때 알게 되고 그때 구글의 메시지를 그대로 보여준다
 */
export function TranslationSettings({ register }: { register?: (h: SectionHandle) => void } = {}) {
  const [loaded, setLoaded] = useState<TranslateSettings | null>(null);
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = () =>
    api.get<TranslateSettings>("/api/system/settings").then((s) => {
      setLoaded(s);
      setKey(s.translateApiKey ?? "");
    });

  useEffect(() => {
    reload().catch(() => setLoaded(null));
  }, []);

  const save = async () => {
    setError(null);
    setSaved(false);
    try {
      await api.put("/api/system/settings/translate", { apiKey: key });
      await reload();
      setSaved(true);
    } catch (caught) {
      setError(errorMessage(caught, "저장하지 못했습니다."));
    }
  };

  /**
   * 키 확인 — **글자를 한 자도 안 쓴다** (2026-08-29에 로컬 모드에도 붙임).
   *
   * 클라우드 모드의 연결 설정에는 있는데 여기만 없었다. `languages`(지원 언어 목록)를
   * 부르므로 보낼 글자가 없어 요금이 안 붙는다 — 번역은 테스트가 곧 돈이 될 수 있어서
   * 무엇으로 시험하느냐가 설계의 일부다
   */
  const test = async () => {
    setError(null);
    putTask({
      id: "connection-test",
      kind: "connection-test",
      title: "번역 키 확인 중",
      progress: { done: 0, total: 0 },
    });
    try {
      const found = await api.post<{ ok: boolean; message: string }>(
        "/api/system/settings/translate/test",
        { apiKey: key },
      );
      updateTask("connection-test", {
        title: `번역 — ${found.ok ? "연결됨" : "연결 실패"}`,
        progress: undefined,
        actions: found.ok
          ? [{ label: "저장", primary: true, run: async () => {
              await save();
              closeTask("connection-test");
            } }]
          : undefined,
        result: { ok: found.ok, message: found.message },
      });
    } catch (caught) {
      updateTask("connection-test", {
        title: "번역 키 확인 실패",
        progress: undefined,
        result: { ok: false, message: errorMessage(caught, "확인하지 못했습니다.") },
      });
    }
  };

  useEffect(() => {
    register?.({ test, save });
  });

  if (!loaded) return <div className="h-32 skeleton-sweep rounded-lg bg-white/[0.06]" />;

  const used = loaded.translation;
  const percent = Math.min(100, (used.usedChars / used.guardChars) * 100);

  return (
    <section className="flex flex-col gap-4 border-t border-white/8 pt-6">
      <div>
        <h3 className="text-[11px] font-semibold tracking-widest text-white/50 uppercase">
          번역
        </h3>
        <p className="mt-1 text-[11px] leading-relaxed text-white/30">
          게임 소개문을 한국어로 옮깁니다. Google Cloud Translation API 키가 필요합니다.
          비워두시면 번역 기능이 꺼집니다.
        </p>
      </div>

      <SecretField
        label="API 키"
        keyName="translate.apiKey"
        value={key}
        onChange={setKey}
        placeholder="AIza…"
      />

      {/*
        사용량을 **키 바로 아래** 둔다. 넘으면 돈이 나가는 유일한 항목이라,
        키를 넣는 순간 얼마나 남았는지가 같이 보여야 한다
      */}
      <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[11px] tracking-widest text-white/40 uppercase">이번 달</span>
          <span className="num text-xs text-white/70">
            {used.usedChars.toLocaleString()} / {used.guardChars.toLocaleString()}자
          </span>
        </div>
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              percent >= 90 ? "bg-red-400/80" : percent >= 70 ? "bg-amber-400/80" : "bg-white/50"
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>
        {/*
          ⚠️ **45만과 50만이 왜 다른지를 반드시 적는다.** 안 적으면 "구글은 50만이라는데
          왜 45만에서 막히지"가 된다. 그 5만은 우리가 적게 셀 수 있는 오차를 위한 여유다
        */}
        <p className="mt-2 text-[11px] leading-relaxed text-white/25">
          구글의 무료 한도는 월 {used.freeChars.toLocaleString()}자입니다. 앱은 그보다 이르게{" "}
          {used.guardChars.toLocaleString()}자에서 막습니다 — 세이브파일마다 따로 세기 때문에
          앱이 아는 양이 실제보다 적을 수 있습니다.
          <br />
          <b className="text-amber-200/60">
            진짜 방어선은 구글 콘솔의 하루 할당량입니다.
          </b>{" "}
          거기서 막히면 요금이 청구되지 않습니다.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={test} disabled={!key.trim()}>
          테스트
        </Button>
        <Button variant="primary" onClick={save}>
          저장
        </Button>
        {saved && <span className="text-xs text-emerald-300/80">저장했습니다.</span>}
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    </section>
  );
}

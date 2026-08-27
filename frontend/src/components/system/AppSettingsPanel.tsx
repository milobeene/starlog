"use client";

import { useEffect, useState } from "react";
import SecretField from "@/components/entry/SecretField";
import { Button } from "@/components/ui/Field";
import { api, errorMessage } from "@/lib/api";
import { getBridge } from "@/lib/desktop";

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

export default function AppSettingsPanel() {
  const [loaded, setLoaded] = useState<Settings | null>(null);
  const [id, setId] = useState("");
  const [secret, setSecret] = useState("");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
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
  const canSave = filled && result?.ok === true;

  const change = (setter: (v: string) => void) => (value: string) => {
    setter(value);
    setResult(null);   // 값이 바뀌면 옛 결과는 거짓말이 된다
    setSaved(false);
  };

  const test = async () => {
    if (!filled) {
      setShowGaps(true);
      return;
    }
    setTesting(true);
    setError(null);
    try {
      setResult(await api.post<TestResult>("/api/system/settings/igdb/test", {
        clientId: id,
        clientSecret: secret,
      }));
    } catch (caught) {
      setError(errorMessage(caught, "확인하지 못했습니다."));
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

  if (!loaded) return <div className="h-40 animate-pulse rounded-lg bg-white/5" />;

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

        {/*
          단계를 나눠서 보여준다 — "실패했습니다" 한 줄이면 키가 틀린 건지 인터넷이
          없는 건지 알 수가 없다. 키를 안 넣고 접속했다가 빈 화면만 본 게 출발점이었다
        */}
        {result && (
          <div
            className={`flex flex-col gap-1.5 rounded-md border px-3 py-2.5 text-xs ${
              result.ok
                ? "border-emerald-500/30 bg-emerald-500/5"
                : "border-red-500/30 bg-red-500/5"
            }`}
          >
            <Line ok={result.tokenIssued} label="키 확인" />
            <Line ok={result.searchWorks} label="게임 검색" />
            <p className="mt-1 text-[11px] text-white/45">{result.message}</p>
          </div>
        )}

        {saved && <p className="text-xs text-emerald-300/80">저장했습니다. 바로 적용됩니다.</p>}
        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={test} disabled={testing}>
            {testing ? "확인 중…" : "연결 테스트"}
          </Button>
          <Button variant="primary" onClick={save} disabled={testing}>
            저장
          </Button>
          {!canSave && (
            <span className="text-[11px] text-white/35">
              {filled ? "연결 테스트를 통과해야 저장할 수 있습니다" : "두 칸을 모두 채워 주세요"}
            </span>
          )}
        </div>
      </section>

      <DataFolder />
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

function Line({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={ok ? "text-emerald-300" : "text-red-400"}>{ok ? "✓" : "✕"}</span>
      <span className="text-white/70">{label}</span>
    </div>
  );
}

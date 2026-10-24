"use client";

import { useEffect, useState } from "react";
import SecretField from "@/components/entry/SecretField";
import { Button } from "@/components/ui/Field";
import type { SectionHandle } from "@/components/system/sectionHandle";
import { api, errorMessage } from "@/lib/api";
import { closeTask, putTask, updateTask } from "@/lib/tasks";

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

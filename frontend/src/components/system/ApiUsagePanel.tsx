"use client";

import Bytes from "@/components/ui/Bytes";
import Unit from "@/components/ui/Unit";
import { useState } from "react";
import { Button } from "@/components/ui/Field";
import { errorMessage } from "@/lib/api";
import { API_LIMITS } from "@/lib/apiLimits";
import type { ApiUsage, SystemStatus } from "@/lib/types";

/**
 * API 사용량 (v1.0 8단계).
 *
 * ## 창을 넷으로 나눠 보여준다
 *
 * 예전에는 누적 카운터 하나였다. 그런데 **한도가 전부 기간당 횟수**라(초당 4회, 월 X회)
 * 누적 숫자로는 한도에 가까운지 알 수가 없었다. 게다가 서버가 재시작되면 0으로 돌아가서
 * 숫자 자체가 뜻을 잃었다.
 *
 * 이제 호출이 행으로 남아 어떤 창으로든 셀 수 있다 — 대신 **보존 기간이 있다**는 것도
 * 함께 적어야 "그 기간치가 전부"임이 드러난다
 */
export default function ApiUsagePanel({
  usage,
  storage,
  retentionDays,
  translation,
  onSaveDailyLimit,
  hasTranslateKey,
  hasIgdbKey,
}: {
  usage: ApiUsage[];
  storage: { coverCount: number; totalBytes: number; configured: boolean };
  retentionDays: number;
  translation: SystemStatus["translation"];
  /** 하루 할당량 저장. 저장 뒤 상위가 다시 받아온다 */
  onSaveDailyLimit: (value: string) => Promise<void>;
  /** 번역 키가 있나 — 없으면 섹션을 안 그린다 (7-5) */
  hasTranslateKey: boolean;
  /** IGDB 키가 있나 */
  hasIgdbKey: boolean;
}) {
  return (
    <div className="flex flex-col gap-8">
      {/*
        **번역이 맨 위다** (2026-08-28). 다른 API는 넘으면 거절당하고 끝이지만
        여기만 넘으면 **요금이 청구된다.** 화면에서도 그 무게가 보여야 한다.
        그래서 카드 한 칸이 아니라 **줄 전체**를 차지한다
      */}
      {/* 키가 없으면 섹션 자체를 안 그린다 (7-5) — 쓸 수 없는 것의 사용량은 뜻이 없다 */}
      {hasTranslateKey && (
        <TranslationRow usage={translation} onSaveDailyLimit={onSaveDailyLimit} />
      )}

      {usage.map((item) => {
        const meta = API_LIMITS[item.provider];
        /*
         * 키가 없는 API는 섹션을 통째로 숨긴다 (7-5, 2026-08-29).
         * 쓸 수 없는 것의 "최근 1시간 0회"는 정보가 아니라 잡음이다
         */
        if (item.provider === "IGDB" && !hasIgdbKey) return null;
        if (item.provider === "STORAGE" && !storage.configured) return null;
        return (
          <section key={item.provider}>
            <h3 className="text-[11px] font-semibold tracking-widest text-white/50 uppercase">
              {meta?.label ?? item.provider}
            </h3>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {/*
                **스토리지는 "최근 1분"이 뜻이 없다.** 초당 한도가 걸리는 건 IGDB고,
                스토리지에서 궁금한 건 "얼마나 쌓였나"다 — 그 자리에 보관량을 놓는다
              */}
              {/*
                "최근 1분"을 되살렸다 (2026-08-29). 뺐던 이유는 "혼자 쓰는 앱에서는 늘 0"이었는데,
                게임 마스터 일괄 동기화가 생기면서 **짧은 시간에 몰아 부르는 경로가 실제로 생겼다** —
                IGDB의 초당 한도에 걸리는지 볼 자리가 필요하다.
                스토리지는 그 자리에 보관량을 놓는다 — 초당 한도가 걸리는 건 IGDB다
              */}
              {item.provider !== "STORAGE" && (
                <Stat label="최근 1분" value={item.lastMinute} />
              )}
              {item.provider === "STORAGE" && (
                <Stat
                  label="커버"
                  /* 개수와 용량을 한 칸에 — 따로 두면 카드가 다섯이 되어 줄이 깨진다 */
                  value={
                    <>
                      {storage.coverCount.toLocaleString()}
                      <Unit>장</Unit>
                      <span className="mx-1 text-white/30">·</span>
                      <Bytes bytes={storage.totalBytes} />
                    </>
                  }
                  raw
                />
              )}
              <Stat label="최근 1시간" value={item.lastHour} />
              <Stat label="최근 24시간" value={item.lastDay} />
              <Stat label={`최근 ${retentionDays}일`} value={item.lastMonth} />
            </div>

            {item.failedLastDay > 0 && (
              <p className="mt-2 text-[11px] text-amber-300/80">
                최근 24시간 중 {item.failedLastDay.toLocaleString()}회 실패 — 실패도 한도를
                소모합니다.
              </p>
            )}

            {/*
              한도는 작게, 그리고 **언제 기준인지와 함께.**
              숫자만 크게 띄우면 "지금 사실"로 읽히는데 실은 우리가 적어둔 값이다
            */}
            {meta && (
              <p className="mt-2 text-[11px] text-white/30">
                한도 {meta.limits.join(" · ")}
                {meta.checkedOn !== "—" && (
                  <span className="ml-1.5 text-white/20">({meta.checkedOn} 기준)</span>
                )}
              </p>
            )}

            <p className="mt-1 text-[11px] text-white/25">
              {item.since
                ? `${formatDate(item.since)}부터 · ${retentionDays}일치만 보관합니다`
                : "아직 호출 기록이 없습니다"}
            </p>
          </section>
        );
      })}
    </div>
  );
}

function Stat({
  label,
  value,
  raw,
}: {
  label: string;
  value: number | string | React.ReactNode;
  /** 숫자 서식을 안 씌운다 (이미 조립된 JSX이거나 "412 KB" 같은 문자열) */
  raw?: boolean;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
      <div className="text-[10px] font-semibold tracking-widest text-white/40 uppercase">
        {label}
      </div>
      <div className="num mt-1 text-xl font-light break-keep text-white/90">
        {/* 숫자일 때만 천 단위를 넣는다. JSX나 문자열은 이미 완성된 것이므로 그대로 */}
        {typeof value === "number" && !raw ? value.toLocaleString() : value}
      </div>
    </div>
  );
}


function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * 번역 사용량 — **줄 전체를 차지한다** (2026-08-28).
 *
 * 다른 카드와 나란히 한 칸에 두면 "1분에 몇 건"과 같은 종류로 읽힌다. 하지만 이건
 * **단위도 다르고**(글자 수) **넘었을 때 벌어지는 일도 다르다**(거절이 아니라 요금).
 *
 * 반응형은 바깥 그리드를 그대로 따른다 — 좁으면 2칸, 넓으면 4칸을 통째로 먹는다
 */
function TranslationRow({
  usage,
  onSaveDailyLimit,
}: {
  usage: SystemStatus["translation"];
  onSaveDailyLimit: (value: string) => Promise<void>;
}) {
  const percent = Math.min(100, (usage.usedChars / usage.guardChars) * 100);
  const limit = usage.dailyLimitChars;
  const dayPercent = limit ? Math.min(100, (usage.usedTodayChars / limit) * 100) : 0;
  /*
   * ⚠️ **넘칠 수 있다** (사용자 지적). 잘못 기록됐거나 한도를 갑자기 낮추면
   * 오늘 쓴 양이 한도를 넘는다. 막대는 100%에서 멈추되 **색으로 알린다**
   */
  const dayOver = limit != null && usage.usedTodayChars > limit;

  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSaveDailyLimit(draft.trim());
      setDraft("");
    } catch (caught) {
      setError(errorMessage(caught, "저장하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h3 className="text-[11px] font-semibold tracking-widest text-white/50 uppercase">번역</h3>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 sm:col-span-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="text-[11px] tracking-widest text-white/40 uppercase">이번 달</span>
            <span className="num text-lg font-medium text-white/90">
              {usage.usedChars.toLocaleString()}
              <span className="text-sm text-white/40">
                {" "}/ {usage.guardChars.toLocaleString()}
                <Unit>자</Unit>
              </span>
            </span>
          </div>

          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                percent >= 90 ? "bg-red-400/80" : percent >= 70 ? "bg-amber-400/80" : "bg-white/50"
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>

          {/*
            하루 게이지 — **캡션이 없다** (사용자 요청). 월 게이지 바로 아래라
            같은 것의 더 짧은 창임이 위치만으로 읽힌다
          */}
          {limit != null ? (
            <>
              <div className="mt-3 flex items-baseline justify-between gap-x-4">
                <span className="num text-xs text-white/50">
                  {usage.usedTodayChars.toLocaleString()}
                  <span className="text-white/30"> / {limit.toLocaleString()}</span>
                  <Unit>자</Unit>
                </span>
                <button
                  type="button"
                  onClick={() => setDraft(String(limit))}
                  className="text-[11px] text-white/30 underline-offset-2 hover:text-white/70 hover:underline"
                >
                  하루 할당량 바꾸기
                </button>
              </div>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    dayOver ? "bg-red-400" : dayPercent >= 80 ? "bg-amber-400/80" : "bg-white/35"
                  }`}
                  style={{ width: `${Math.max(dayPercent, dayOver ? 100 : 0)}%` }}
                />
              </div>
              {dayOver && (
                <p className="mt-1 text-[11px] text-red-300/80">
                  오늘 쓴 양이 적어두신 하루 할당량을 넘었습니다.
                </p>
              )}
            </>
          ) : (
            /*
              ⚠️ **한도를 안 적었으면 게이지 대신 안내다** (사용자 결정).
              기본값을 박아두면 진지 않은 선을 진짜로 믿게 된다 — 그리고 그게 돈이다
            */
            <p className="mt-3 rounded-md border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-[11px] leading-relaxed text-amber-200/75">
              무료 한도를 넘으면 <b className="text-amber-100">요금이 청구됩니다.</b> 구글 클라우드
              콘솔에서 <b className="text-amber-100">하루 할당량</b>을 설정하시고 그 값을 여기 적어
              주세요 — 권장 10,000자.
            </p>
          )}

          {(draft !== "" || limit == null) && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="10000"
                inputMode="numeric"
                className="num w-28 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white outline-none focus:border-white/30"
              />
              <Button onClick={save} disabled={busy || draft === ""}>
                {busy ? "저장 중" : "저장"}
              </Button>
              {limit != null && (
                <button
                  type="button"
                  onClick={() => setDraft("")}
                  className="text-[11px] text-white/30 hover:text-white/70"
                >
                  취소
                </button>
              )}
              {error && <span className="text-[11px] text-red-300/80">{error}</span>}
            </div>
          )}

          {/*
            ⚠️ **45만과 50만이 왜 다른지를 반드시 적는다.** 안 적으면 "구글은 50만이라는데
            왜 45만에서 막히지"가 된다. 그 5만은 우리가 적게 셀 수 있는 오차를 위한 여유다
          */}
          <p className="mt-2 text-[11px] leading-relaxed text-white/30">
            구글 무료 한도는 월 {usage.freeChars.toLocaleString()}자. 앱은 그보다 이르게{" "}
            {usage.guardChars.toLocaleString()}자에서 막습니다 — 세이브파일마다 따로 세기 때문에
            앱이 아는 양이 실제보다 적을 수 있습니다.
          </p>
        </div>
      </div>
    </section>
  );
}

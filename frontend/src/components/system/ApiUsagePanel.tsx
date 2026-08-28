"use client";

import Bytes from "@/components/ui/Bytes";
import Unit from "@/components/ui/Unit";
import { API_LIMITS } from "@/lib/apiLimits";
import type { ApiUsage } from "@/lib/types";

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
}: {
  usage: ApiUsage[];
  storage: { coverCount: number; totalBytes: number; configured: boolean };
  retentionDays: number;
  translation: {
    usedChars: number;
    guardChars: number;
    freeChars: number;
    remainingChars: number;
  };
}) {
  return (
    <div className="flex flex-col gap-8">
      {/*
        **번역이 맨 위다** (2026-08-28). 다른 API는 넘으면 거절당하고 끝이지만
        여기만 넘으면 **요금이 청구된다.** 화면에서도 그 무게가 보여야 한다.
        그래서 카드 한 칸이 아니라 **줄 전체**를 차지한다
      */}
      <TranslationRow usage={translation} />

      {usage.map((item) => {
        const meta = API_LIMITS[item.provider];
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
                "최근 1분"을 뺐다 (사용자 요청 2026-08-28). 혼자 쓰는 앱에서 분 단위 호출 수는
                거의 늘 0이라 자리만 차지했다 — 초당 한도에 걸릴 만큼 몰아 쓰는 일이 없다
              */}
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
}: {
  usage: { usedChars: number; guardChars: number; freeChars: number; remainingChars: number };
}) {
  const percent = Math.min(100, (usage.usedChars / usage.guardChars) * 100);

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
            ⚠️ **45만과 50만이 왜 다른지를 반드시 적는다.** 안 적으면 "구글은 50만이라는데
            왜 45만에서 막히지"가 된다. 그 5만은 우리가 적게 셀 수 있는 오차를 위한 여유다
          */}
          <p className="mt-2 text-[11px] leading-relaxed text-white/30">
            구글 무료 한도는 월 {usage.freeChars.toLocaleString()}자. 앱은 그보다 이르게{" "}
            {usage.guardChars.toLocaleString()}자에서 막습니다 — 세이브파일마다 따로 세기 때문에
            앱이 아는 양이 실제보다 적을 수 있습니다.{" "}
            <b className="text-amber-200/60">
              넘으면 거절이 아니라 요금입니다. 진짜 방어선은 구글 콘솔의 하루 할당량입니다.
            </b>
          </p>
        </div>
      </div>
    </section>
  );
}

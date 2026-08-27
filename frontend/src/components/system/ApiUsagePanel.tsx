"use client";

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
}: {
  usage: ApiUsage[];
  storage: { coverCount: number; totalBytes: number; configured: boolean };
  retentionDays: number;
}) {
  return (
    <div className="flex flex-col gap-8">
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
              {item.provider === "STORAGE" ? (
                <Stat
                  label="커버"
                  /* 개수와 용량을 한 칸에 — 따로 두면 카드가 다섯이 되어 줄이 깨진다 */
                  value={`${storage.coverCount.toLocaleString()}장 · ${formatBytes(storage.totalBytes)}`}
                  raw
                />
              ) : (
                <Stat label="최근 1분" value={item.lastMinute} />
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
  value: number | string;
  /** 숫자 서식을 안 씌운다 (이미 "412 KB" 같은 문자열) */
  raw?: boolean;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
      <div className="text-[10px] font-semibold tracking-widest text-white/40 uppercase">
        {label}
      </div>
      <div className="num mt-1 text-xl font-light break-keep text-white/90">
        {raw || typeof value === "string" ? value : value.toLocaleString()}
      </div>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

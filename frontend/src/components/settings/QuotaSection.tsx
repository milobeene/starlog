"use client";

import SettingsSection from "./SettingsSection";
import { useApi } from "@/lib/useApi";
import type { QuotaStatus } from "@/lib/types";

/**
 * WEB-ONLY: 오늘 남은 쿼터 (docs/web-only-inventory.md §5 규칙 3).
 *
 * **이 화면이 쿼터 방침의 절반이다.** "모르고 막히는 것"보다 "하루에 몇 건까지인지
 * 보이는 것"이 낫다는 판단으로 넣었다 — 숫자가 없으면 한도는 그냥 갑자기 나는 에러다.
 *
 * 응답이 **빈 배열이면 통째로 안 그린다.** 쿼터가 없는 빌드에서 서버가 빈 배열을 주므로
 * 백엔드에서 빈을 빼는 것만으로 이 섹션이 따라 사라진다 — 프론트에 분기를 안 남긴다
 */
export default function QuotaSection() {
  const quota = useApi<QuotaStatus[]>("/api/me/quota");

  if (quota.loading || !quota.data || quota.data.length === 0) return null;

  return (
    <SettingsSection
      title="오늘 사용량"
      icon="note"
      description="게임 정보는 외부 데이터베이스에서 가져옵니다. 그쪽 한도가 서비스 전체 기준이라 하루치를 나눠 씁니다. 자정에 다시 채워집니다."
    >
      <ul className="flex flex-col gap-2">
        {quota.data.map((row) => {
          const ratio = row.limit > 0 ? Math.min(1, row.used / row.limit) : 0;
          // 다 쓰기 전에 미리 알려준다 — 막히고 나서 아는 것보다 낫다
          const tone =
            ratio >= 1 ? "bg-red-400" : ratio >= 0.8 ? "bg-amber-400" : "bg-white/50";

          return (
            <li
              key={row.kind}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-3"
            >
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-sm">{row.label}</span>
                <span className="num text-xs text-white/50">
                  {row.used} / {row.limit}
                </span>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full transition-[width] duration-500 ${tone}`}
                  style={{ width: `${ratio * 100}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </SettingsSection>
  );
}

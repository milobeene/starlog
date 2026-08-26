"use client";

import DataTable from "@/components/library/DataTable";
import ErrorNotice from "@/components/ui/ErrorNotice";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApi } from "@/lib/useApi";
import type { SystemStatus } from "@/lib/types";

/**
 * WEB-ONLY: 시스템 현황 (docs/capacity-planning.md §3).
 *
 * **외부 모니터링 도구를 안 붙였다.** 필요한 값이 전부 DB와 인메모리 카운터로 나오고,
 * 무료 티어에서 의존을 하나 더 얹는 대가가 이 규모에서 얻는 것보다 크다.
 * Actuator도 같은 이유로 뺐다 — 단일 인스턴스가 15분마다 재시작해 요청 수 통계가
 * 계속 0으로 돌아가서 숫자가 의미를 못 가진다.
 */
export default function AdminSystemTab() {
  const status = useApi<SystemStatus>("/api/admin/system");

  if (status.error) return <ErrorNotice error={status.error} onRetry={status.reload} />;
  if (status.loading || !status.data) return <Skeleton className="h-64 w-full" />;

  const { igdb, storage, database, quotaToday } = status.data;

  return (
    <div className="flex flex-col gap-8">
      <section>
        <SectionTitle>외부 게임 DB (IGDB)</SectionTitle>
        {igdb ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="누적 호출" value={igdb.calls.toLocaleString()} />
            <Stat
              label="자리 없어 반려"
              value={igdb.rejected.toLocaleString()}
              tone={igdb.rejected > 0 ? "warn" : undefined}
            />
            <Stat label="동시 허용" value={String(igdb.maxConcurrent)} />
            <Stat label="최소 간격" value={`${igdb.minCallIntervalMillis}ms`} />
          </div>
        ) : (
          <Empty>가짜 카탈로그 구현이 붙어 있어 계측이 없습니다</Empty>
        )}
        {/* 이 오해를 미리 막는다 — 0이 "호출이 없었다"로 읽히면 판단이 어긋난다 */}
        <Note>
          서버가 뜬 뒤의 누적입니다. 15분 무활동이면 인스턴스가 잠들어 0부터 다시 셉니다.
        </Note>
      </section>

      <section>
        <SectionTitle>저장소</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="커버 수" value={storage.coverCount.toLocaleString()} />
          <Stat label="사용량" value={formatBytes(storage.totalBytes)} />
          <Stat label="데이터베이스" value={database.product} />
          <Stat
            label="DB 크기"
            value={database.sizeBytes === null ? "—" : formatBytes(database.sizeBytes)}
          />
        </div>
        <Note>
          커버 사용량은 스토리지에 묻지 않고 DB의 파일 크기 합으로 계산합니다.
          DB 크기는 PostgreSQL에서만 나옵니다.
        </Note>
      </section>

      <section>
        <SectionTitle>오늘 사용량</SectionTitle>
        {quotaToday.length === 0 ? (
          <Empty>오늘은 아직 아무도 쓰지 않았습니다</Empty>
        ) : (
          <DataTable headers={["회원", "종류", "사용", "한도"]}>
            {quotaToday.map((row) => (
              <tr key={`${row.memberId}-${row.kind}`} className="border-t border-white/5">
                <td className="px-4 py-2.5 text-sm">{row.nickname}</td>
                <td className="px-4 py-2.5 text-sm text-white/60">{row.label}</td>
                {/* 관리자는 한도가 없다(null). 그래도 몇 번 썼는지는 세어 보여준다 —
                    안 세면 정작 부하를 만든 사람만 목록에서 사라진다 */}
                <td
                  className={`num px-4 py-2.5 text-sm ${
                    row.limit !== null && row.used >= row.limit ? "text-red-400" : ""
                  }`}
                >
                  {row.used}
                </td>
                <td className="num px-4 py-2.5 text-sm text-white/40">
                  {row.limit === null ? "무제한" : row.limit}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </section>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 text-xs font-semibold tracking-widest text-white/45 uppercase">
      {children}
    </h3>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
      <div className="mb-1 text-[11px] text-white/40">{label}</div>
      <div className={`num text-lg ${tone === "warn" ? "text-amber-400" : "text-white/90"}`}>
        {value}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-center text-xs text-white/30">
      {children}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-[11px] leading-relaxed text-white/30">{children}</p>;
}

/** 1024 단위. 저장소 한도(R2 10GB, Neon 0.5GB)가 그 단위로 표기된다 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}

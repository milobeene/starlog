"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageHeading from "@/components/ui/PageHeading";
import ErrorNotice from "@/components/ui/ErrorNotice";
import { Skeleton } from "@/components/ui/Skeleton";
import ApiUsagePanel from "@/components/system/ApiUsagePanel";
import GameMasterPanel from "@/components/system/GameMasterPanel";
import ConnectionPanel from "@/components/system/ConnectionPanel";
import AppSettingsPanel from "@/components/system/AppSettingsPanel";
import { useApi } from "@/lib/useApi";
import type { SystemStatus } from "@/lib/types";

/**
 * 시스템 화면 (v1.0 8단계).
 *
 * ## `/admin`이 여기가 됐다
 *
 * 해체하려다 **성격만 바꿨다.** 없앴으면 갈 곳 없는 것들이 남았을 것이다 —
 * 자격증명 · 사용량 · 마스터 편집은 전부 "앱 전체" 층위라 개별 게임 화면에도,
 * 프로필 설정에도 안 맞는다. 그 화면이 계획에 없었는데 `/admin`이 이미 그 자리에 있었다.
 *
 * **"관리자"라는 말은 통째로 없앴다.** 한 설치 = 한 사람이라 관리할 남이 없다.
 * 이름이 남아 있으면 없앤 개념이 화면에 계속 살아 있게 된다.
 */
const TABS = [
  { key: "usage", label: "사용량" },
  { key: "games", label: "게임 마스터" },
  { key: "settings", label: "앱 설정" },
  { key: "keys", label: "연결" },
] as const;

type Tab = (typeof TABS)[number]["key"];

export default function SystemPage() {
  /*
   * `useSearchParams`는 프리렌더 때 값을 모르므로 Suspense 경계가 필요하다
   * (정적 내보내기의 요구다 — 상세 화면과 같은 이유)
   */
  return (
    <Suspense fallback={null}>
      <SystemContent />
    </Suspense>
  );
}

function SystemContent() {
  /*
   * **주소가 탭을 정한다** (2026-08-28). 알림의 [설정으로]가 여기로 돌려보내는데,
   * 탭이 상태에만 있으면 늘 첫 탭(사용량)에서 시작해서 **연결 설정을 다시 찾아 들어가야 했다**
   */
  const requested = useSearchParams().get("tab");
  const [tab, setTab] = useState<Tab>(
    TABS.some((t) => t.key === requested) ? (requested as Tab) : "usage",
  );

  return (
    <main className="h-full overflow-y-auto">
      <div className="page-x page-top mx-auto w-full max-w-5xl pb-20">
        <PageHeading
          eyebrow="System"
          title="시스템"
          subtitle="내 키의 사용량과 게임 마스터를 관리하실 수 있습니다."
        />

        <div className="mt-8 mb-6 flex gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
          {TABS.map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              aria-pressed={tab === item.key}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === item.key ? "bg-white text-black" : "text-white/50 hover:text-white"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/*
          탭마다 상태가 따로 놀아야 해서 컴포넌트를 나눴다.
          한 컴포넌트에서 page를 공유하면 탭을 옮길 때 3페이지에서 시작하는 일이 생긴다
        */}
        {tab === "usage" && <UsageTab />}
        {tab === "games" && <GameMasterPanel />}
        {tab === "settings" && <AppSettingsPanel />}
        {tab === "keys" && <ConnectionPanel />}
      </div>
    </main>
  );
}

function UsageTab() {
  const status = useApi<SystemStatus>("/api/system");

  if (status.error) return <ErrorNotice error={status.error} onRetry={status.reload} />;
  if (status.loading || !status.data) return <Skeleton className="h-64 w-full" />;

  const { apiUsage, storage, database, retentionDays } = status.data;

  return (
    <div className="flex flex-col gap-10">
      <ApiUsagePanel usage={apiUsage} storage={storage} retentionDays={retentionDays} />

      {/*
        **저장소에는 데이터베이스만 남긴다** (2026-08-28). 커버 수·용량은 스토리지 사용량이라
        위의 API 사용량 카드로 옮겼다 — 한 화면에 "저장소"가 둘 있으면 뭐가 뭔지 흐려진다.
        제품명(`PostgreSQL`)도 뺐다 — JDBC가 알려주는 건 형식뿐이라 Neon인지 Supabase인지는
        알 방법이 없고, 형식만 적어두면 아는 게 없는 것과 같다
      */}
      <section>
        <h3 className="text-[11px] font-semibold tracking-widest text-white/50 uppercase">
          데이터베이스
        </h3>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="크기"
            value={database.sizeBytes === null ? "—" : formatBytes(database.sizeBytes)}
          />
        </div>
        {database.sizeBytes === null && (
          <p className="mt-2 text-[11px] text-white/30">
            지금 데이터베이스는 크기를 알려주지 않습니다.
          </p>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
      <div className="text-[10px] font-semibold tracking-widest text-white/40 uppercase">
        {label}
      </div>
      <div className="num mt-1 text-xl font-light text-white/90">{value}</div>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

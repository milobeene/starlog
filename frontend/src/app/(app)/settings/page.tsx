"use client";

import { Suspense, useState } from "react";
import PageHeading from "@/components/ui/PageHeading";
import ErrorNotice from "@/components/ui/ErrorNotice";
import DeletedEntriesSection from "@/components/settings/DeletedEntriesSection";
import SettingsDialogs from "@/components/settings/SettingsDialogs";
import type { SettingsDialog } from "@/components/settings/settingsDialog";
import { MemoSection, ProfileSection } from "@/components/settings/ProfileSections";
import {
  AccountsSection,
  DevicesSection,
  EmulatorsSection,
  InputMethodsSection,
  PlatformsSection,
  SubscriptionsSection,
} from "@/components/settings/CatalogSections";
import DictionarySection from "@/components/settings/DictionarySection";
import { useApi } from "@/lib/useApi";
import type { CompanyDictionary, FacetsResponse, MeResponse } from "@/lib/types";

/**
 * 프로필 · 선택지 다섯 종 · 구독 · 사전 · 계정.
 *
 * 선택지(플랫폼·계정·기기·에뮬·입력 방식)는 전부 **내 소유**라 여기서 고치고 지운다.
 * 이름을 바꾸면 그 항목을 문 회차·취득이 전부 따라 바뀐다 — FK라 값을 복사해두지 않았다.
 *
 * 섹션마다 엔드포인트가 다르다 (쓰기는 리소스 단위, API 설계서 §0).
 * 읽기는 `/api/me` 하나가 전부 통째로 준다
 */
export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const me = useApi<MeResponse>("/api/me");
  /*
   * 사전 수정에는 id가 필요한데 /api/me/options는 이름만 준다.
   * facets가 { id, name, count }를 주므로 그쪽을 쓴다 — 게임에 적용 중인 것만 나오는데,
   * 안 붙은 사전 행은 어차피 조회에서 걸러지므로(§6.7 자동 소멸) 고칠 대상도 아니다
   */
  const facets = useApi<FacetsResponse>("/api/backlog/facets");
  const companies = useApi<CompanyDictionary>("/api/backlog/companies");
  const [dialog, setDialog] = useState<SettingsDialog>(null);

  const refresh = () => {
    me.reload();
    facets.reload();
    companies.reload();
  };

  if (me.error) return <ErrorNotice error={me.error} onRetry={me.reload} />;

  return (
    <main className="h-full overflow-y-auto">
      <div className="page-x page-top mx-auto w-full max-w-3xl pb-20">
        <PageHeading
          eyebrow="Settings"
          title="프로필 / 설정"
          subtitle="계정과 기록에 사용되는 정보를 관리하실 수 있습니다."
        />

        <div className="mt-8">
        </div>

        <div className="mt-2 flex flex-col gap-10">
          <ProfileSection loading={me.loading} data={me.data} onOpen={setDialog} />

          <MemoSection loading={me.loading} data={me.data} onOpen={setDialog} />

          <PlatformsSection data={me.data} onOpen={setDialog} onDone={refresh} />

          <AccountsSection data={me.data} onOpen={setDialog} onDone={refresh} />

          <DevicesSection data={me.data} onOpen={setDialog} onDone={refresh} />

          <EmulatorsSection data={me.data} onOpen={setDialog} onDone={refresh} />

          <InputMethodsSection data={me.data} onOpen={setDialog} onDone={refresh} />

          <SubscriptionsSection data={me.data} onOpen={setDialog} onDone={refresh} />

          <DictionarySection facets={facets.data} companies={companies.data} onDone={refresh} />

          {/*
            "데이터 옮기기"는 **시스템 → 앱 설정**으로 갔다 (2026-08-28).
            세이브파일과 데이터베이스를 오가는 일은 프로필(내 이름·배경색)이 아니라
            앱 층위다 — 이 화면에 있으면 "내 프로필을 옮긴다"처럼 읽힌다
          */}

          {/*
            **맨 아래다.** 되살리기·완전 삭제는 자주 쓰는 기능이 아니고, 위에 두면
            설정을 열 때마다 "삭제한 게임"이 먼저 눈에 들어온다.
            삭제한 게 없으면 스스로 아무것도 안 그린다
          */}
          <DeletedEntriesSection />
        </div>
      </div>

      <SettingsDialogs
        dialog={dialog}
        data={me.data}
        onClose={() => setDialog(null)}
        onSaved={refresh}
      />
    </main>
  );
}

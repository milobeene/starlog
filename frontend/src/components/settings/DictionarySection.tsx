"use client";

import SettingsSection from "@/components/settings/SettingsSection";
import Dictionary from "@/components/settings/Dictionary";
import ReadOnlyDictionary from "@/components/settings/ReadOnlyDictionary";
import type { CompanyDictionary, FacetsResponse } from "@/lib/types";

export default function DictionarySection({
  facets,
  companies,
  onDone,
}: {
  facets: FacetsResponse | null;
  companies: CompanyDictionary | null;
  onDone: () => void;
}) {
  return (
    <SettingsSection
      collapsible
      title="사전"
      icon="book"
      description="게임에 사용하신 항목만 표시됩니다. 이름을 변경하시면 해당 게임 전체에 반영됩니다."
    >
      <div className="flex flex-col gap-5">
        <Dictionary
          label="태그"
          items={facets?.tags ?? []}
          basePath="/api/me/tags"
          onDone={onDone}
          reorderable
        />
        <Dictionary
          label="장르"
          items={facets?.genres ?? []}
          basePath="/api/me/genres"
          onDone={onDone}
        />
        {/*
          개발사·유통사는 엔티티가 아니라 항목에 박힌 문자열이라 id가 없다 →
          일괄 수정 경로가 없어 보기 전용이다. 고치려면 그 게임의 상세에서 바꾼다
        */}
        <ReadOnlyDictionary
          label="개발사"
          names={companies?.overriddenDevelopers ?? []}
        />
        <ReadOnlyDictionary
          label="유통사"
          names={companies?.overriddenPublishers ?? []}
        />
      </div>
    </SettingsSection>
  );
}

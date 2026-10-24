"use client";

import { useState } from "react";
import Combobox from "@/components/ui/Combobox";
import { STATUS_LABEL_EN } from "@/lib/labels";
import { Field, INPUT } from "@/components/library/FilterControls";
import { AcquisitionAxis, PlaythroughAxis } from "@/components/library/FilterAxes";
import { EMPTY_FILTERS, hasAnyFilter, type Filters } from "@/components/library/filters";
import { useFilterOptions } from "@/components/library/useFilterOptions";
import type {
  EntryStatus,
  FacetsResponse,
  GenreDistribution,
  OptionsResponse,
} from "@/lib/types";

// 바깥에서 쓰는 이름은 그대로 여기서 나간다 — 필터 값과 판정은 filters.ts에 있다
export { EMPTY_FILTERS, hasAnyFilter, type Filters };

/**
 * 필터를 한 박스에 모았다 (사이드바는 전체 목록 전용).
 *
 * **입력값은 draft에 쌓고 Apply를 눌러야 적용된다.** 개발사·연도가 자유 입력이라
 * 타자마다 쏘면 "닌"·"닌텐"에서 빈 결과가 번쩍인다. 조건은 전부 AND로 겹친다.
 *
 * 태그는 여기 없다 — 폴더 뷰가 태그 탐색을 맡는다
 */
export default function FilterBox({
  facets,
  genres,
  options,
  developers,
  applied,
  onApply,
}: {
  facets: FacetsResponse | null;
  genres: GenreDistribution[] | null;
  options: OptionsResponse | null;
  developers: string[] | null;
  applied: Filters;
  onApply: (next: Filters) => void;
}) {
  const [draft, setDraft] = useState<Filters>(applied);
  const [seen, setSeen] = useState(applied);

  // 바깥에서 초기화(Clear)하면 입력칸도 따라 비워져야 한다.
  // effect가 아니라 렌더 중 비교로 처리한다 — effect로 하면 한 프레임 늦게 반영돼 깜빡인다
  if (seen !== applied) {
    setSeen(applied);
    setDraft(applied);
  }

  const draftOptions = useFilterOptions({ facets, genres, options, developers, draft });
  const { developerOptions, genreOptions } = draftOptions;

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const toggleStatus = (status: EntryStatus) =>
    setDraft((prev) => ({
      ...prev,
      status: prev.status.includes(status)
        ? prev.status.filter((item) => item !== status)
        : [...prev.status, status],
    }));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onApply(draft);
      }}
      className="flex flex-col gap-4 rounded-lg border border-white/10 bg-black/20 p-5"
    >
      {/* 상태 — 복수 선택 */}
      <div className="flex items-start gap-4">
        <span className="w-14 shrink-0 pt-1.5 text-[10px] font-semibold tracking-widest text-white/35 uppercase sm:w-20">
          Status
        </span>
        <div className="flex flex-wrap gap-1.5">
          {(facets?.statuses ?? []).map((item) => {
            const active = draft.status.includes(item.status);
            return (
              <button
                key={item.status}
                type="button"
                onClick={() => toggleStatus(item.status)}
                aria-pressed={active}
                className={`rounded-full border px-2.5 py-1 text-xs whitespace-nowrap transition-colors ${
                  active
                    ? "border-white/40 bg-white/20 text-white"
                    : "border-white/10 bg-white/5 text-white/60 hover:border-white/25 hover:text-white"
                }`}
              >
                {STATUS_LABEL_EN[item.status]} <span className="num text-white/30">{item.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 나머지 5종 — 전부 AND로 겹친다 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Field label="Developer">
          <Combobox
            options={developerOptions}
            value={draft.developer}
            onChange={(value) => set("developer", value)}
            placeholder="닌텐도"
            freeText
            className={INPUT}
          />
        </Field>

        <Field label="Genre">
          <Combobox
            options={genreOptions}
            value={draft.genreName}
            onChange={(value) => set("genreName", value)}
            placeholder="메트로배니아"
            freeText
            className={INPUT}
          />
        </Field>

        <Field label="Release Year">
          {/*
            type=number를 안 쓴다 — 브라우저가 붙이는 위/아래 스피너를 어두운 테마에
            맞출 방법이 없다. inputMode로 모바일 숫자 키패드만 챙긴다
          */}
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            value={draft.releaseYear}
            onChange={(event) => set("releaseYear", event.target.value.replace(/\D/g, ""))}
            placeholder="2017"
            className={`${INPUT} num`}
          />
        </Field>

      </div>

      {/* ── 회차 축 ── */}
      <PlaythroughAxis draft={draft} set={set} options={draftOptions} />

      {/* ── 취득 축 ── */}
      <AcquisitionAxis draft={draft} set={set} options={draftOptions} />

      <div className="flex items-center gap-2 border-t border-white/5 pt-3">
        <button
          type="submit"
          className="rounded-md border border-white/20 px-5 py-1.5 text-xs font-medium tracking-widest uppercase transition-all hover:bg-white hover:text-black"
        >
          Apply
        </button>
        {/*
          ⚠️ **적용 안 한 입력도 지울 수 있어야 한다** (v1.2). 예전엔 `applied`만 봐서,
          칸에 뭘 잔뜩 쳐놓고 Apply를 안 눌렀으면 지우는 버튼이 안 떴다 —
          한 칸씩 손으로 비우는 수밖에 없었다
        */}
        {(hasAnyFilter(applied) || hasAnyFilter(draft)) && (
          <button
            type="button"
            onClick={() => {
            setDraft(EMPTY_FILTERS);
            onApply(EMPTY_FILTERS);
          }}
            className="px-2 text-[11px] tracking-wider text-white/40 uppercase transition-colors hover:text-white"
          >
            Clear all
          </button>
        )}
      </div>
    </form>
  );
}

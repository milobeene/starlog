"use client";

import { useMemo, useState } from "react";
import Combobox, { type ComboOption } from "@/components/ui/Combobox";
import { STATUS_LABEL_EN } from "@/lib/labels";
import type {
  EntryStatus,
  FacetsResponse,
  GenreDistribution,
  OptionsResponse,
} from "@/lib/types";

export type Filters = {
  status: EntryStatus[];
  /** 장르는 이름으로 건다 — 개인 장르가 마스터를 덮어쓰기 때문 (§6.7) */
  genreName: string;
  developer: string;
  releaseYear: string;
  deviceId: string;
  platformId: string;
  platformAccountId: string;
};

export const EMPTY_FILTERS: Filters = {
  status: [],
  genreName: "",
  developer: "",
  releaseYear: "",
  deviceId: "",
  platformId: "",
  platformAccountId: "",
};

export function hasAnyFilter(filters: Filters): boolean {
  return (
    filters.status.length > 0 ||
    Boolean(filters.genreName || filters.developer || filters.releaseYear ||
      filters.deviceId || filters.platformId || filters.platformAccountId)
  );
}

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

  // 자동완성은 **사전에 있는 것만** 보여준다. 사전에 없는 값도 직접 쳐서 거를 수 있다 —
  // 서버는 마스터 값까지 뒤지므로 IGDB가 준 이름으로도 검색된다
  const developerOptions = useMemo<ComboOption[]>(
    () => (developers ?? []).map((name) => ({ value: name, label: name })),
    [developers],
  );
  const genreOptions = useMemo<ComboOption[]>(
    () => (genres ?? []).map((item) => ({ value: item.genre, label: item.genre, count: item.count })),
    [genres],
  );
  const deviceOptions = useMemo<ComboOption[]>(
    () => (facets?.devices ?? []).map((item) => ({ value: String(item.id), label: item.name, count: item.count })),
    [facets],
  );
  const platformOptions = useMemo<ComboOption[]>(
    () => (options?.platforms ?? []).map((item) => ({ value: String(item.id), label: item.name })),
    [options],
  );
  /*
   * 계정은 facets를 쓴다 — 카운트가 붙고, 실제로 취득에 쓰인 계정만 나온다.
   * options 쪽은 아직 아무 데도 안 쓴 계정까지 줘서 필터로는 과하다
   */
  const accountOptions = useMemo<ComboOption[]>(
    () =>
      (facets?.platformAccounts ?? []).map((item) => ({
        value: String(item.id),
        label: item.name,
        count: item.count,
      })),
    [facets],
  );

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

        <Field label="Device">
          <Combobox
            options={deviceOptions}
            value={draft.deviceId}
            onChange={(value) => set("deviceId", value)}
            placeholder="전체"
            className={INPUT}
          />
        </Field>

        <Field label="Platform">
          <Combobox
            options={platformOptions}
            value={draft.platformId}
            onChange={(value) => set("platformId", value)}
            placeholder="전체"
            className={INPUT}
          />
        </Field>

        <Field label="Account">
          <Combobox
            options={accountOptions}
            value={draft.platformAccountId}
            onChange={(value) => set("platformAccountId", value)}
            placeholder="전체"
            className={INPUT}
          />
        </Field>
      </div>

      <div className="flex items-center gap-2 border-t border-white/5 pt-3">
        <button
          type="submit"
          className="rounded-md border border-white/20 px-5 py-1.5 text-xs font-medium tracking-widest uppercase transition-all hover:bg-white hover:text-black"
        >
          Apply
        </button>
        {hasAnyFilter(applied) && (
          <button
            type="button"
            onClick={() => onApply(EMPTY_FILTERS)}
            className="px-2 text-[11px] tracking-wider text-white/40 uppercase transition-colors hover:text-white"
          >
            Clear all
          </button>
        )}
      </div>
    </form>
  );
}

const INPUT =
  "w-full rounded-md border border-white/10 bg-white/5 py-1.5 pr-7 pl-3 text-sm text-white transition-colors placeholder:text-white/25 focus:border-white/30 focus:bg-white/10 focus:outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold tracking-widest text-white/35 uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}

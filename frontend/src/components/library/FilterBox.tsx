"use client";

import { accountLabel, ACQUISITION_METHOD_LABEL } from "@/lib/labels";
import DateField from "@/components/ui/DateField";
import { useMemo, useState } from "react";
import Combobox, { type ComboOption } from "@/components/ui/Combobox";
import { STATUS_LABEL_EN } from "@/lib/labels";
import type {
  EntryStatus,
  FacetsResponse,
  GenreDistribution,
  OptionsResponse,
} from "@/lib/types";

/**
 * 필터는 **축이 셋이다** (v1.1).
 *
 * <pre>
 *   기본   항목 자체의 성질        상태·장르·개발사·출시연도
 *   회차   "언제 무엇으로 했나"    기기·플랫폼|에뮬·계정·기간
 *   취득   "어떻게 손에 넣었나"    방법·통화/가격·플랫폼·계정·기간
 * </pre>
 *
 * ⚠️ 예전에는 셋이 한 줄에 섞여 있었다 — `Device`는 회차 기준인데 `Platform`·`Account`는
 * 취득 기준이라, **같은 이름의 필터가 서로 다른 것을 세고 있었다.** 화면에서 구별할 방법이
 * 없어서 "스팀으로 걸었는데 스팀에서 한 게임이 안 나온다"가 생겼다
 */
export type Filters = {
  status: EntryStatus[];
  /** 장르는 이름으로 건다 — 개인 장르가 마스터를 덮어쓰기 때문 (§6.7) */
  genreName: string;
  developer: string;
  releaseYear: string;

  /* 회차 축 */
  ptDeviceId: string;
  /** 플랫폼과 에뮬은 토글로 하나만 — 동시에 고를 일이 없다 */
  ptRunsOn: "platform" | "emulator";
  ptPlatformId: string;
  ptEmulatorId: string;
  ptAccountId: string;
  ptFrom: string;
  ptTo: string;

  /* 취득 축 */
  acqMethod: string;
  acqCurrency: string;
  acqMinPrice: string;
  acqMaxPrice: string;
  acqPlatformId: string;
  acqAccountId: string;
  acqFrom: string;
  acqTo: string;
};

export const EMPTY_FILTERS: Filters = {
  status: [],
  genreName: "",
  developer: "",
  releaseYear: "",
  ptDeviceId: "",
  ptRunsOn: "platform",
  ptPlatformId: "",
  ptEmulatorId: "",
  ptAccountId: "",
  ptFrom: "",
  ptTo: "",
  acqMethod: "",
  acqCurrency: "",
  acqMinPrice: "",
  acqMaxPrice: "",
  acqPlatformId: "",
  acqAccountId: "",
  acqFrom: "",
  acqTo: "",
};

/** `ptRunsOn`은 토글이라 "걸린 것"으로 안 센다 — 기본값이 platform이다 */
/** 접히는 축 하나. 셋이 세로로 서고 각자 접힌다 (사용자 결정) */
function AxisSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-white/5 pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-[11px] font-semibold tracking-widest text-white/50 uppercase transition-colors hover:text-white/80"
      >
        <span className={`text-[10px] transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
        {title}
        <span className="font-normal tracking-normal text-white/25 normal-case">{hint}</span>
      </button>
      {open && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {children}
        </div>
      )}
    </div>
  );
}

export function hasAnyFilter(filters: Filters): boolean {
  const { status, ptRunsOn: _ignored, ...rest } = filters;
  return status.length > 0 || Object.values(rest).some(Boolean);
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
  const acqAccountOptions = useMemo<ComboOption[]>(
    () => {
      const picked = draft.acqPlatformId ? Number(draft.acqPlatformId) : null;
      return (options?.platformAccounts ?? [])
        .filter((a) => picked == null || a.platformId === picked)
        .map((a) => ({
          value: String(a.id),
          label: accountLabel(a.platformName ?? a.emulatorName, a.name),
        }));
    },
    [options, draft.acqPlatformId],
  );

  const emulatorOptions = useMemo<ComboOption[]>(
    () => (options?.emulators ?? []).map((item) => ({ value: String(item.id), label: item.name })),
    [options],
  );

  /** 회차의 계정 — **고른 소속의 것만**. 소속을 안 고르면 비어 있다 */
  const ptOwnerPicked = Boolean(
    draft.ptRunsOn === "platform" ? draft.ptPlatformId : draft.ptEmulatorId,
  );
  const ptAccountOptions = useMemo<ComboOption[]>(
    () => {
      if (!ptOwnerPicked) return [];
      const owner = Number(draft.ptRunsOn === "platform" ? draft.ptPlatformId : draft.ptEmulatorId);
      return (options?.platformAccounts ?? [])
        .filter((a) => (draft.ptRunsOn === "platform" ? a.platformId : a.emulatorId) === owner)
        .map((a) => ({
          value: String(a.id),
          label: accountLabel(a.platformName ?? a.emulatorName, a.name),
        }));
    },
    [options, draft.ptRunsOn, draft.ptPlatformId, draft.ptEmulatorId, ptOwnerPicked],
  );

  const methodOptions = useMemo<ComboOption[]>(
    () =>
      Object.entries(ACQUISITION_METHOD_LABEL).map(([value, label]) => ({
        value,
        label: String(label),
      })),
    [],
  );

  /** 통화는 실제로 쓰인 것만 — 지출 차트가 주는 목록과 같은 출처다 */
  const currencyOptions = useMemo<ComboOption[]>(
    () => ["KRW", "USD", "JPY", "EUR"].map((c) => ({ value: c, label: c })),
    [],
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

      </div>

      {/* ── 회차 축 ── */}
      <AxisSection title="회차 검색" hint="언제 무엇으로 했나">
        <Field label="Device">
          <Combobox
            options={deviceOptions}
            value={draft.ptDeviceId}
            onChange={(value) => set("ptDeviceId", value)}
            placeholder="전체"
            className={INPUT}
          />
        </Field>

        <Field label={draft.ptRunsOn === "platform" ? "Platform" : "Emulator"}>
          {/* 토글 — 동시에 고를 일이 없어 한 칸을 나눠 쓴다 (회차 다이얼로그와 같은 규칙) */}
          <div className="mb-1 flex gap-1">
            {(["platform", "emulator"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  set("ptRunsOn", mode);
                  set("ptPlatformId", "");
                  set("ptEmulatorId", "");
                  set("ptAccountId", "");
                }}
                className={`rounded px-2 py-0.5 text-[10px] tracking-widest uppercase transition-colors ${
                  draft.ptRunsOn === mode
                    ? "bg-white/15 text-white"
                    : "text-white/35 hover:bg-white/8 hover:text-white/70"
                }`}
              >
                {mode === "platform" ? "플랫폼" : "에뮬"}
              </button>
            ))}
          </div>
          <Combobox
            options={draft.ptRunsOn === "platform" ? platformOptions : emulatorOptions}
            value={draft.ptRunsOn === "platform" ? draft.ptPlatformId : draft.ptEmulatorId}
            onChange={(value) => {
              set(draft.ptRunsOn === "platform" ? "ptPlatformId" : "ptEmulatorId", value);
              set("ptAccountId", "");
            }}
            placeholder="전체"
            className={INPUT}
          />
        </Field>

        <Field label="Account">
          {/* 소속을 골라야 계정을 고를 수 있다 — 스팀을 골랐는데 닌텐도 계정이 뜨면 안 된다 */}
          <Combobox
            options={ptAccountOptions}
            value={draft.ptAccountId}
            onChange={(value) => set("ptAccountId", value)}
            placeholder={ptOwnerPicked ? "전체" : "먼저 위를 고르세요"}
            className={INPUT}
          />
        </Field>

        <Field label="From">
          <DateField value={draft.ptFrom} onChange={(v) => set("ptFrom", v)} />
        </Field>
        <Field label="To">
          <DateField value={draft.ptTo} onChange={(v) => set("ptTo", v)} />
        </Field>
      </AxisSection>

      {/* ── 취득 축 ── */}
      <AxisSection title="취득 검색" hint="어떻게 손에 넣었나">
        <Field label="Method">
          <Combobox
            options={methodOptions}
            value={draft.acqMethod}
            onChange={(value) => set("acqMethod", value)}
            placeholder="전체"
            className={INPUT}
          />
        </Field>

        <Field label="Currency" >
          <Combobox
            options={currencyOptions}
            value={draft.acqCurrency}
            onChange={(value) => set("acqCurrency", value)}
            placeholder="전체"
            className={INPUT}
          />
        </Field>

        <Field label="Price">
          <div className="flex items-center gap-1.5">
            <input
              inputMode="numeric"
              value={draft.acqMinPrice}
              onChange={(e) => set("acqMinPrice", e.target.value.replace(/\D/g, ""))}
              placeholder="최소"
              className={`${INPUT} num min-w-0 flex-1`}
            />
            <span className="text-white/25">~</span>
            <input
              inputMode="numeric"
              value={draft.acqMaxPrice}
              onChange={(e) => set("acqMaxPrice", e.target.value.replace(/\D/g, ""))}
              placeholder="최대"
              className={`${INPUT} num min-w-0 flex-1`}
            />
          </div>
        </Field>

        <Field label="Platform">
          <Combobox
            options={platformOptions}
            value={draft.acqPlatformId}
            onChange={(value) => {
              set("acqPlatformId", value);
              set("acqAccountId", "");
            }}
            placeholder="전체"
            className={INPUT}
          />
        </Field>

        <Field label="Account">
          <Combobox
            options={acqAccountOptions}
            value={draft.acqAccountId}
            onChange={(value) => set("acqAccountId", value)}
            placeholder={draft.acqPlatformId ? "전체" : "먼저 플랫폼을 고르세요"}
            className={INPUT}
          />
        </Field>

        <Field label="From">
          <DateField value={draft.acqFrom} onChange={(v) => set("acqFrom", v)} />
        </Field>
        <Field label="To">
          <DateField value={draft.acqTo} onChange={(v) => set("acqTo", v)} />
        </Field>
      </AxisSection>

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

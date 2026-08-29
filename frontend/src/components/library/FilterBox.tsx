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
        /* 패딩까지 눌리게 (v1.2). 음수 마진으로 칸 밖으로 안 밀려나온다 */
        className="-mx-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[11px] font-semibold tracking-widest text-white/50 uppercase transition-colors hover:bg-white/5 hover:text-white/80"
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

  /**
   * 회차의 계정 — 소속을 고르면 그 소속의 것만, 안 고르면 **그 종류 전체**.
   * (플랫폼 모드면 플랫폼 계정, 에뮬 모드면 에뮬 계정. 취득 축과 같은 규칙이다)
   */
  const ptAccountOptions = useMemo<ComboOption[]>(
    () => {
      const owner = Number(draft.ptRunsOn === "platform" ? draft.ptPlatformId : draft.ptEmulatorId);
      const picked = Number.isFinite(owner) && owner > 0 ? owner : null;
      return (options?.platformAccounts ?? [])
        .filter((a) => {
          const ownerId = draft.ptRunsOn === "platform" ? a.platformId : a.emulatorId;
          return ownerId != null && (picked == null || ownerId === picked);
        })
        .map((a) => ({
          value: String(a.id),
          label: accountLabel(a.platformName ?? a.emulatorName, a.name),
        }));
    },
    [options, draft.ptRunsOn, draft.ptPlatformId, draft.ptEmulatorId],
  );

  /** 구매가 아니면 가격·통화가 성립하지 않는다. 빈 값(전체)은 잠그지 않는다 */
  const priceLocked = draft.acqMethod !== "" && draft.acqMethod !== "PURCHASED";

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
          <Select
            options={deviceOptions}
            value={draft.ptDeviceId}
            onChange={(value) => set("ptDeviceId", value)}
          />
        </Field>

        <Field label={draft.ptRunsOn === "platform" ? "Platform" : "Emulator"}>
          <Select
            options={draft.ptRunsOn === "platform" ? platformOptions : emulatorOptions}
            value={draft.ptRunsOn === "platform" ? draft.ptPlatformId : draft.ptEmulatorId}
            onChange={(value) => {
              set(draft.ptRunsOn === "platform" ? "ptPlatformId" : "ptEmulatorId", value);
              set("ptAccountId", "");
            }}
          />
          {/* 토글 — 동시에 고를 일이 없어 한 칸을 나눠 쓴다 (회차 다이얼로그와 같은 규칙) */}
          <div className="mt-1.5 flex gap-1">
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
        </Field>

        <Field label="Account">
          {/*
            **막지 않는다** (v1.2). 저장 폼이라면 "스팀 + 닌텐도 계정"이 모순이라 소속을
            먼저 받아야 하지만, 여기는 필터라 계정 하나만으로도 말이 된다.
            소속을 고르면 그때 좁혀준다
          */}
          <Select
            options={ptAccountOptions}
            value={draft.ptAccountId}
            onChange={(value) => set("ptAccountId", value)}
          />
        </Field>

        {/*
          **기간은 늘 마지막 줄에 둘만** (v1.2). 칸 폭이 화면마다 달라서 From과 To가
          줄 끝에서 갈라지는 일이 생겼다 — 짝인데 떨어져 있으면 범위로 안 읽힌다.
          `col-span-full`이 새 줄을 강제하고, 그 안에서 둘이 절반씩 나눠 갖는다
        */}
        <div className="col-span-full grid grid-cols-2 gap-3 sm:max-w-lg">
          <Field label="From">
            <DateField value={draft.ptFrom} onChange={(v) => set("ptFrom", v)} />
          </Field>
          <Field label="To">
            <DateField value={draft.ptTo} onChange={(v) => set("ptTo", v)} />
          </Field>
        </div>
      </AxisSection>

      {/* ── 취득 축 ── */}
      <AxisSection title="취득 검색" hint="어떻게 손에 넣었나">
        <Field label="Method">
          {/* 방법은 enum이라 늘어날 여지가 없다 — 자유 입력이 필요 없으니 select다 */}
          <Select
            options={methodOptions}
            value={draft.acqMethod}
            onChange={(value) => {
              set("acqMethod", value);
              /*
                구매가 아니면 값이 남아 있으면 안 된다 (v1.2). 칸만 잠그고 값을 안 지우면
                "선물"을 고른 채로 예전 가격 조건이 조용히 계속 걸린다
              */
              if (value !== "" && value !== "PURCHASED") {
                set("acqCurrency", "");
                set("acqMinPrice", "");
                set("acqMaxPrice", "");
              }
            }}
          />
        </Field>

        <Field label="Price">
          {/*
            **구매가 아니면 가격이 없다** (v1.2). 선물·무료·구독으로 얻은 것에
            "10000원 이상" 같은 조건을 걸면 결과가 늘 0이라, 필터가 고장 난 것처럼 보인다.
            빈 값(전체)일 때는 열어 둔다 — 방법을 안 고르고 가격만 보는 건 말이 된다
          */}
          <div className="flex items-center gap-1.5">
            <input
              inputMode="numeric"
              disabled={priceLocked}
              value={draft.acqMinPrice}
              onChange={(e) => set("acqMinPrice", e.target.value.replace(/\D/g, ""))}
              placeholder={priceLocked ? "—" : "최소"}
              className={`${INPUT} num min-w-0 flex-1 disabled:cursor-not-allowed disabled:opacity-40`}
            />
            <span className="text-white/25">~</span>
            <input
              inputMode="numeric"
              disabled={priceLocked}
              value={draft.acqMaxPrice}
              onChange={(e) => set("acqMaxPrice", e.target.value.replace(/\D/g, ""))}
              placeholder={priceLocked ? "—" : "최대"}
              className={`${INPUT} num min-w-0 flex-1 disabled:cursor-not-allowed disabled:opacity-40`}
            />
          </div>
          {/*
            통화는 **가격의 단위**라 가격 바로 아래에 둔다 (v1.2).
            환율을 안 쓰므로(§6.6) 통화를 안 고르면 ₩10,000과 $10,000이 같은 줄에 선다
          */}
          <div className="mt-1.5 flex gap-1">
            {["", "KRW", "USD", "JPY"].map((c) => (
              <button
                key={c || "any"}
                type="button"
                disabled={priceLocked}
                onClick={() => set("acqCurrency", c)}
                className={`rounded px-2 py-0.5 text-[10px] tracking-widest uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                  draft.acqCurrency === c
                    ? "bg-white/15 text-white"
                    : "text-white/35 hover:bg-white/8 hover:text-white/70"
                }`}
              >
                {c || "전체"}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Platform">
          <Select
            options={platformOptions}
            value={draft.acqPlatformId}
            onChange={(value) => {
              set("acqPlatformId", value);
              set("acqAccountId", "");
            }}
          />
        </Field>

        <Field label="Account">
          <Select
            options={acqAccountOptions}
            value={draft.acqAccountId}
            onChange={(value) => set("acqAccountId", value)}
          />
        </Field>

        {/*
          **기간은 늘 마지막 줄에 둘만** (v1.2). 칸 폭이 화면마다 달라서 From과 To가
          줄 끝에서 갈라지는 일이 생겼다 — 짝인데 떨어져 있으면 범위로 안 읽힌다.
          `col-span-full`이 새 줄을 강제하고, 그 안에서 둘이 절반씩 나눠 갖는다
        */}
        <div className="col-span-full grid grid-cols-2 gap-3 sm:max-w-lg">
          <Field label="From">
            <DateField value={draft.acqFrom} onChange={(v) => set("acqFrom", v)} />
          </Field>
          <Field label="To">
            <DateField value={draft.acqTo} onChange={(v) => set("acqTo", v)} />
          </Field>
        </div>
      </AxisSection>

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

const INPUT =
  "w-full rounded-md border border-white/10 bg-white/5 py-1.5 pr-7 pl-3 text-sm text-white transition-colors placeholder:text-white/25 focus:border-white/30 focus:bg-white/10 focus:outline-none";

/** 옵션 팝업은 OS가 그린다 — 배경을 직접 주지 않으면 흰 판이 뜬다 (Field.tsx와 같은 이유) */
const SELECT = `${INPUT} [&>option]:bg-neutral-900`;

/**
 * 소속·기기·계정은 **고르는 것**이지 치는 것이 아니다 (v1.2).
 * 상세의 회차 다이얼로그가 이미 네이티브 select라 검색 박스도 같은 물건으로 맞춘다 —
 * 자유 입력이 필요한 Developer·Genre만 Combobox로 남는다
 */
function Select({
  value,
  onChange,
  options,
  empty = "전체",
}: {
  value: string;
  onChange: (value: string) => void;
  options: ComboOption[];
  empty?: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={SELECT}>
      <option value="">{empty}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

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

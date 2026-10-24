"use client";

import DateField from "@/components/ui/DateField";
import { AxisSection, Field, INPUT, Select } from "@/components/library/FilterControls";
import type { Filters, SetFilter } from "@/components/library/filters";
import type { useFilterOptions } from "@/components/library/useFilterOptions";

type Options = ReturnType<typeof useFilterOptions>;

/** 회차 축 — "언제 무엇으로 했나" */
export function PlaythroughAxis({
  draft,
  set,
  options,
}: {
  draft: Filters;
  set: SetFilter;
  options: Options;
}) {
  const { deviceOptions, platformOptions, emulatorOptions, ptAccountOptions } = options;

  return (
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
  );
}

/** 취득 축 — "어떻게 손에 넣었나" */
export function AcquisitionAxis({
  draft,
  set,
  options,
}: {
  draft: Filters;
  set: SetFilter;
  options: Options;
}) {
  const { methodOptions, platformOptions, acqAccountOptions } = options;
  /** 구매가 아니면 가격·통화가 성립하지 않는다. 빈 값(전체)은 잠그지 않는다 */
  const priceLocked = draft.acqMethod !== "" && draft.acqMethod !== "PURCHASED";

  return (
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
  );
}

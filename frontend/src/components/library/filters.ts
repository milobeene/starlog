import type { EntryStatus } from "@/lib/types";

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

/** 한 칸을 바꾸는 setter — 축 컴포넌트들이 같은 모양으로 받는다 */
export type SetFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => void;

/** `ptRunsOn`은 토글이라 "걸린 것"으로 안 센다 — 기본값이 platform이다 */
export function hasAnyFilter(filters: Filters): boolean {
  const { status, ptRunsOn: _ignored, ...rest } = filters;
  return status.length > 0 || Object.values(rest).some(Boolean);
}

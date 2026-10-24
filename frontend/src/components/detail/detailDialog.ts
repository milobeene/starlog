import type { Acquisition, Playthrough } from "@/lib/types";

/** 열려 있는 다이얼로그. 회차·취득은 수정 대상을 같이 들고 다닌다 (null이면 추가) */
export type DetailDialog =
  | null
  | { kind: "record" }
  | { kind: "overrides" }
  | { kind: "tag" }
  | { kind: "cover" }
  | { kind: "delete" }
  | { kind: "playthrough"; run: Playthrough | null }
  | { kind: "acquisition"; item: Acquisition | null };

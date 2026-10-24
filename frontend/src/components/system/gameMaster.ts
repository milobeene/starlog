/** 마스터 목록과 IGDB 검색 결과를 한 모양으로 합친 표시용 행 */
export type GameRow = {
  gameId: number | null;
  name: string;
  source: string;
  releasedOn: string | null;
  coverImageId: string | null;
  lastSyncedAt: string | null;
};

/* 선택 헬퍼는 스크린샷 갤러리도 쓰므로 lib로 올렸다 — 기존 import 경로는 그대로 둔다 */
export { applyPick, type PickModifier } from "@/lib/pick";

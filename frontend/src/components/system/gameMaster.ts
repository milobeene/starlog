/** 마스터 목록과 IGDB 검색 결과를 한 모양으로 합친 표시용 행 */
export type GameRow = {
  gameId: number | null;
  name: string;
  source: string;
  releasedOn: string | null;
  coverImageId: string | null;
  lastSyncedAt: string | null;
};

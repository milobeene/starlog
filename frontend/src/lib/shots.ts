import { backendUrl } from "@/lib/apiBase";

/** `/api/backlog/{id}/screenshots` 한 줄 */
export type Shot = {
  fileName: string;
  url: string;
  sizeBytes: number;
  contentType: string;
  /** 원본을 찍은 시각. 이게 있어야 "넣은 순서"가 아니라 "찍은 순서"로 볼 수 있다 */
  takenAt: string | null;
  /** 저화질 썸네일. 없으면 원본으로 폴백한다 (MediaThumb) */
  thumbUrl: string | null;
  placeholder?: string | null;
};

/**
 * **최신이 앞이다** — 스크린샷 화면과 상세 구역이 같은 순서여야 한다 (추가 카드 다음에 방금 찍은 것이 온다).
 * 서버는 파일명 순으로 주고 옛 파일은 찍은 시각이 없어 뒤로 간다.
 * ⚠️ 서버는 `/api/…` 상대 경로를 주는데 화면이 `app://`에서 도는 지금 그대로 쓰면 안 열린다 —
 * 절대 주소로 바꾸는 곳을 **목록을 만드는 이 한 곳**으로 둔다 (소비처마다 감싸면 하나 늘 때 또 깨진다)
 */
export function newestFirst(list: Shot[]): Shot[] {
  return [...list]
    .sort((a, b) => (b.takenAt ?? "").localeCompare(a.takenAt ?? "") || b.fileName.localeCompare(a.fileName))
    .map((shot) => ({ ...shot, url: backendUrl(shot.url), thumbUrl: shot.thumbUrl ? backendUrl(shot.thumbUrl) : null }));
}

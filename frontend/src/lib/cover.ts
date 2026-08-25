/**
 * 커버 이미지 2단 폴백 (스펙 §6.10).
 *
 *   coverUrl(개인 업로드) → coverImageId(IGDB) → null(플레이스홀더)
 *
 * 서버가 URL을 하나로 합쳐주지 않는 이유 — 자리마다 크기가 달라야 해서
 * 크기 선택이 화면 몫이다. 실데이터는 개인 0건 / IGDB 76건이라 사실상 아래 경로만 탄다
 */

/**
 * 실측 크기 (2026-08 확인) — 문서의 264×374는 틀렸다.
 *   t_micro 40×40 · t_thumb 90×90  ← **정사각이다.** 세로 자리에 쓰면 눌린다
 *   t_cover_small 90×120 · t_cover_big 264×352  ← 세로 3:4
 */
export type IgdbSize =
  | "t_thumb"
  | "t_cover_small"
  | "t_cover_big"
  | "t_720p"
  | "t_1080p";

export function coverSrc(
  coverUrl: string | null,
  coverImageId: string | null,
  size: IgdbSize = "t_cover_big",
): string | null {
  if (coverUrl) return coverUrl;
  if (coverImageId) {
    return `https://images.igdb.com/igdb/image/upload/${size}/${coverImageId}.jpg`;
  }
  return null;
}

/** 상세 상단 배너 — 가로 키아트. 없으면 커버를 크게 늘려 쓴다 */
export function bannerSrc(
  bannerImageId: string | null,
  coverImageId: string | null,
): string | null {
  const id = bannerImageId ?? coverImageId;
  return id ? `https://images.igdb.com/igdb/image/upload/t_1080p/${id}.jpg` : null;
}

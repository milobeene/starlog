import { coverSrc } from "@/lib/cover";
import type { BacklogCard } from "@/lib/types";

/**
 * 폴더 배경용 커버 체스판 — 커버를 **격자로 평평하게 깔고 통째로 대각선으로 기울인다**
 * (스팀 모음집 스타일, `docs/ref-folder-bg-steam.png`).
 *
 * 폴더 칸은 정사각이라 기울인 격자가 칸을 다 덮으려면 폭이 칸의 1.5배는 돼야 한다 (≈ cos35°+sin35°=1.39,
 * 여유 포함). 격자는 K열 × K행으로 두고 칸(셀)은 커버 비율 3:4다.
 *
 * - 커버 수에 따라 K가 달라진다: 1장 → 1×1(큰 한 장), 2~4장 → 2×2, 5장 이상 → 3×3.
 *   장수가 모자라면 같은 커버가 **체스판 무늬로 번갈아** 채운다 (2장이면 대각선 줄무늬).
 * - 가볍게 그린다: `<img>` 최대 9장 + 래퍼 하나의 `transform`뿐이다. 블러·필터 없음,
 *   작은 썸네일(`t_cover_small` 90×120, 큰 칸만 `t_cover_big`)을 `loading="lazy"`로.
 * - 0장이면 아무것도 안 그린다 — 부르는 쪽이 기존 배경만 쓴다
 */

/** 기울기. 45°면 정확히 마름모지만 그러면 커버가 서 있는 느낌이 사라져 약간 눕힌다 */
const TILT_DEG = -32;

/** 격자에 올릴 커버를 고른다 — 평점 높은 순(없는 건 뒤), 커버가 있는 것만, 최대 9장 */
export function pickFolderCovers(cards: BacklogCard[], max = 9): BacklogCard[] {
  return cards
    .filter((c) => c.coverUrl || c.coverImageId)
    .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1))
    .slice(0, max);
}

/** 장수 → 한 변의 칸 수 */
function gridSize(count: number): 1 | 2 | 3 {
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  return 3;
}

/** 셀 하나에 어느 커버를 넣나. 장수가 한 변보다 적으면 (행+열)로 돌려서 체스판처럼 번갈아 둔다 */
function coverIndex(row: number, col: number, size: number, count: number): number {
  if (count <= size) return (row + col) % count;
  return (row * size + col) % count;
}

export default function FolderCovers({ cards }: { cards: BacklogCard[] }) {
  const picked = pickFolderCovers(cards);
  if (picked.length === 0) return null;

  const size = gridSize(picked.length);
  /* 큰 칸(1·2열)은 해상도가 필요하고, 3열은 칸이 작아 작은 썸네일로 충분하다 */
  const imgSize = size === 3 ? "t_cover_small" : "t_cover_big";
  const cells = Array.from({ length: size * size }, (_, i) => {
    const row = Math.floor(i / size);
    const col = i % size;
    return picked[coverIndex(row, col, size, picked.length)];
  });

  return (
    <div
      aria-hidden
      /* 가운데를 축으로 돌린다. 폭 150%면 정사각 칸의 모서리까지 덮는다 */
      className="pointer-events-none absolute top-1/2 left-1/2 grid gap-[3px]"
      style={{
        width: "150%",
        gridTemplateColumns: `repeat(${size}, 1fr)`,
        transform: `translate(-50%, -50%) rotate(${TILT_DEG}deg)`,
      }}
    >
      {cells.map((card, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          src={coverSrc(card.coverUrl, card.coverImageId, imgSize) ?? undefined}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="aspect-[3/4] w-full rounded-[3px] object-cover"
        />
      ))}
    </div>
  );
}

import { STATUS_LABEL_EN } from "@/lib/labels";
import type { EntryStatus } from "@/lib/types";

const COLOR: Record<EntryStatus, string> = {
  WISHLIST: "badge-wishlist",
  BACKLOG: "badge-backlog",
  PLAYING: "badge-playing",
  PAUSED: "badge-paused",
  DROPPED: "badge-dropped",
  COMPLETED: "badge-completed",
};

/**
 * 상태 배지. **그리드 카드와 상세 헤더가 같은 배지를 쓴다.**
 *
 * 예전엔 커버 위 전용으로 파스텔 배경의 `plain` 변형이 따로 있어서, 같은 PLAYING이
 * 그리드에서는 연두색 / 상세에서는 진초록으로 보였다. 상태 색은 화면마다 달라지면 안 되는
 * 정보라 어두운 쪽으로 통일했다.
 *
 * 커버 위 가독성은 색 대비가 아니라 `.badge-status`의 그림자가 맡는다 —
 * 그림자는 두 화면에서 같은 값이라 크기가 어긋나지 않는다.
 *
 * size는 밀도 차이일 뿐이다. 상세 헤더는 제목 옆이라 한 단계 크다
 */
export default function StatusBadge({
  status,
  size = "sm",
}: {
  status: EntryStatus;
  size?: "sm" | "md";
}) {
  const scale = size === "md" ? "px-2.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-[10px]";

  return (
    <span
      className={`badge-status ${COLOR[status]} ${scale} inline-block rounded font-bold tracking-[0.08em] uppercase`}
    >
      {STATUS_LABEL_EN[status]}
    </span>
  );
}

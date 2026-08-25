import { STATUS_LABEL_EN } from "@/lib/labels";
import type { EntryStatus } from "@/lib/types";

const SOLID: Record<EntryStatus, string> = {
  WISHLIST: "badge-wishlist",
  BACKLOG: "badge-backlog",
  PLAYING: "badge-playing",
  PAUSED: "badge-paused",
  DROPPED: "badge-dropped",
  COMPLETED: "badge-completed",
};

/** 글씨는 흰색 고정, **반투명 배경 색**으로 상태를 알린다 */
const PLAIN: Record<EntryStatus, string> = {
  WISHLIST: "chip-wishlist",
  BACKLOG: "chip-backlog",
  PLAYING: "chip-playing",
  PAUSED: "chip-paused",
  DROPPED: "chip-dropped",
  COMPLETED: "chip-completed",
};

/**
 * solid — 채운 알약. 면 위(상세 헤더)에서 쓴다.
 * plain — 반투명 박스 + 블러. **커버 이미지 위** 전용이다.
 *         불투명하게 채우면 커버 아트를 가리고, 글씨만 두면 밝은 커버에서 안 읽힌다
 */
export default function StatusBadge({
  status,
  size = "sm",
  variant = "solid",
}: {
  status: EntryStatus;
  size?: "sm" | "md";
  variant?: "solid" | "plain";
}) {
  if (variant === "plain") {
    return (
      <span
        className={`badge-chip ${PLAIN[status]} inline-block rounded px-2 py-0.5 text-[10px] font-bold tracking-[0.08em] uppercase`}
      >
        {STATUS_LABEL_EN[status]}
      </span>
    );
  }

  const scale = size === "md" ? "px-2.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-[10px]";
  return (
    <span
      className={`${SOLID[status]} ${scale} inline-block rounded font-bold tracking-wider uppercase shadow-sm`}
    >
      {STATUS_LABEL_EN[status]}
    </span>
  );
}

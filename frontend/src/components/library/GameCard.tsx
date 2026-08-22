import type { BacklogCard } from "@/lib/types";
import CoverPlaceholder from "@/components/common/CoverPlaceholder";
import StatusBadge from "@/components/common/StatusBadge";
import { formatRating } from "@/lib/labels";
import styles from "./GridView.module.css";

type Props = {
  card: BacklogCard;
  onSelect: (entryId: number) => void;
};

/** 태그는 카드에 표시하지 않는다 (§6.7 — 태그는 탐색 수단이다) */
export default function GameCard({ card, onSelect }: Props) {
  return (
    <button type="button" className={styles.card} onClick={() => onSelect(card.entryId)}>
      <CoverPlaceholder />
      <span className={styles.name}>{card.displayName}</span>
      <span className={styles.rating}>★ {formatRating(card.rating)}</span>
      <StatusBadge status={card.status} size="sm" />
    </button>
  );
}

import type { BacklogCard } from "@/lib/types";
import EmptyState from "@/components/common/EmptyState";
import GameCard from "./GameCard";
import styles from "./GridView.module.css";

type Props = {
  cards: BacklogCard[];
  onSelect: (entryId: number) => void;
};

export default function GridView({ cards, onSelect }: Props) {
  if (cards.length === 0) {
    return <EmptyState message="담은 게임이 없습니다" />;
  }

  return (
    <div className={styles.grid}>
      {cards.map((card) => (
        <GameCard key={card.entryId} card={card} onSelect={onSelect} />
      ))}
    </div>
  );
}

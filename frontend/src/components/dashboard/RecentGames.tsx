import Link from "next/link";
import type { BacklogCard } from "@/lib/types";
import CoverPlaceholder from "@/components/common/CoverPlaceholder";
import StatusBadge from "@/components/common/StatusBadge";
import EmptyState from "@/components/common/EmptyState";
import SectionHeader from "@/components/common/SectionHeader";
import styles from "./RecentGames.module.css";

type Props = {
  cards: BacklogCard[];
};

/** 목록 API sort=lastPlayed 상위 몇 개 */
export default function RecentGames({ cards }: Props) {
  return (
    <section className={styles.section}>
      <SectionHeader
        title="최근 플레이"
        action={
          <Link href="/library" className={styles.more}>
            전체 보기 →
          </Link>
        }
      />

      {cards.length === 0 ? (
        <EmptyState message="아직 플레이 기록이 없습니다" />
      ) : (
        <ul className={styles.row}>
          {cards.map((card) => (
            <li key={card.entryId}>
              <Link href="/library" className={styles.card}>
                <CoverPlaceholder />
                <span className={styles.name}>{card.displayName}</span>
                <StatusBadge status={card.status} size="sm" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

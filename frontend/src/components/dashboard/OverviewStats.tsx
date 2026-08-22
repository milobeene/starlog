import type { EntryStatus } from "@/lib/types";
import { MOCK_TOTAL, statusCount } from "@/lib/mock";
import { STATUS_LABEL } from "@/lib/labels";
import styles from "./OverviewStats.module.css";

const HIGHLIGHTED: EntryStatus[] = ["PLAYING", "COMPLETED", "WISHLIST"];

/** 실제 수치는 GET /api/backlog/facets 의 statuses 로 채운다 */
export default function OverviewStats() {
  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>Library Overview</h2>
      <ul className={styles.grid}>
        <li className={styles.card}>
          <span className={styles.label}>전체</span>
          <strong className={styles.value}>{MOCK_TOTAL}</strong>
        </li>
        {HIGHLIGHTED.map((status) => (
          <li key={status} className={styles.card} data-status={status}>
            <span className={styles.label}>{STATUS_LABEL[status]}</span>
            <strong className={styles.value}>{statusCount(status)}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}

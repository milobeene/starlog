import type { BacklogDetail } from "@/lib/types";
import CoverPlaceholder from "@/components/common/CoverPlaceholder";
import StatusBadge from "@/components/common/StatusBadge";
import { formatRating } from "@/lib/labels";
import styles from "./DetailView.module.css";

type Props = {
  detail: BacklogDetail;
};

export default function GameHeader({ detail }: Props) {
  return (
    <header className={styles.gameHeader}>
      <div className={styles.cover}>
        <CoverPlaceholder />
      </div>

      <div className={styles.gameHeaderText}>
        <h1 className={styles.gameName}>{detail.resolved.name}</h1>
        <div className={styles.gameMeta}>
          {/* 상태는 회차·취득에서 자동 파생된다 → 읽기 전용 */}
          <StatusBadge status={detail.status} />
          <span className={styles.rating}>
            ★ {formatRating(detail.personalRecord.rating)}
          </span>
        </div>
      </div>
    </header>
  );
}

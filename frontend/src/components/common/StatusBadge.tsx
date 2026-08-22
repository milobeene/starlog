import type { EntryStatus, PlaythroughStatus } from "@/lib/types";
import { PLAYTHROUGH_STATUS_LABEL, STATUS_LABEL } from "@/lib/labels";
import styles from "./StatusBadge.module.css";

type Props = {
  status: EntryStatus | PlaythroughStatus;
  size?: "sm" | "md";
};

/** 항목 상태는 회차·취득에서 자동 파생된다 → 읽기 전용 배지. 드롭다운을 만들면 안 된다 */
export default function StatusBadge({ status, size = "md" }: Props) {
  const label =
    STATUS_LABEL[status as EntryStatus] ??
    PLAYTHROUGH_STATUS_LABEL[status as PlaythroughStatus];

  return (
    <span className={`${styles.badge} ${styles[size]}`} data-status={status}>
      {label}
    </span>
  );
}

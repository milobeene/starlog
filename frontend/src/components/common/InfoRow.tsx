import type { ReactNode } from "react";
import styles from "./InfoRow.module.css";

type Props = {
  label: string;
  children: ReactNode;
  /** 오버라이드 화면의 "마스터: ~" 힌트 */
  masterHint?: string | null;
  /** 접두어 없는 부연 설명 */
  note?: string | null;
};

export default function InfoRow({ label, children, masterHint, note }: Props) {
  return (
    <div className={styles.row}>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.value}>
        {children}
        {masterHint && <span className={styles.master}>└ 마스터: {masterHint}</span>}
        {note && <span className={styles.master}>└ {note}</span>}
      </dd>
    </div>
  );
}

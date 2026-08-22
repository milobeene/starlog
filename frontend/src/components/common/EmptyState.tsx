import type { ReactNode } from "react";
import styles from "./EmptyState.module.css";

type Props = {
  message: string;
  action?: ReactNode;
};

export default function EmptyState({ message, action }: Props) {
  return (
    <div className={styles.empty}>
      <p className={styles.message}>{message}</p>
      {action}
    </div>
  );
}

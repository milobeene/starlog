import type { ReactNode } from "react";
import styles from "./SectionHeader.module.css";

type Props = {
  title: string;
  hint?: string;
  action?: ReactNode;
};

export default function SectionHeader({ title, hint, action }: Props) {
  return (
    <header className={styles.header}>
      <h2 className={styles.title}>
        {title}
        {hint && <span className={styles.hint}>{hint}</span>}
      </h2>
      {action && <div className={styles.action}>{action}</div>}
    </header>
  );
}

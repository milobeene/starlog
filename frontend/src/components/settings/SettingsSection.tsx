import type { ReactNode } from "react";
import SectionHeader from "@/components/common/SectionHeader";
import styles from "./Settings.module.css";

type Props = {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
};

export default function SettingsSection({ title, hint, action, children }: Props) {
  return (
    <section className={styles.section}>
      <SectionHeader title={title} hint={hint} action={action} />
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}

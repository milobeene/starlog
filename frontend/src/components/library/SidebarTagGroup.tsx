import type { SidebarEntry } from "@/lib/types";
import styles from "./LibrarySidebar.module.css";

type Props = {
  tag: string;
  entries: SidebarEntry[];
  selectedEntryId: number | null;
  onSelect: (entryId: number) => void;
};

/** 태그는 접었다 펴는 폴더가 아니라 섹션 헤더다. 항상 펼쳐둔다 */
export default function SidebarTagGroup({
  tag,
  entries,
  selectedEntryId,
  onSelect,
}: Props) {
  return (
    <section className={styles.group}>
      <h3 className={styles.groupLabel}>{tag}</h3>
      <ul>
        {entries.map((entry) => (
          <li key={`${tag}-${entry.entryId}`}>
            <button
              type="button"
              className={styles.entry}
              aria-current={entry.entryId === selectedEntryId ? "true" : undefined}
              onClick={() => onSelect(entry.entryId)}
            >
              {entry.displayName}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

import Link from "next/link";
import type { SidebarGroup } from "@/lib/mock";
import SidebarTagGroup from "./SidebarTagGroup";
import styles from "./LibrarySidebar.module.css";

type Props = {
  groups: SidebarGroup[];
  selectedEntryId: number | null;
  onSelect: (entryId: number) => void;
};

/**
 * 전체 게임을 항상 펼쳐 보여주는 탐색 목록.
 * ⚠️ 이 화면용 "전 항목 + 태그" 조회 API는 아직 없다 (목록 API는 페이징 20건 + 태그 미포함).
 */
export default function LibrarySidebar({ groups, selectedEntryId, onSelect }: Props) {
  return (
    <aside className={styles.sidebar}>
      <h2 className={styles.heading}>Library</h2>

      <nav className={styles.scroll} aria-label="게임 목록">
        {groups.map((group) => (
          <SidebarTagGroup
            key={group.tag}
            tag={group.tag}
            entries={group.entries}
            selectedEntryId={selectedEntryId}
            onSelect={onSelect}
          />
        ))}
      </nav>

      <Link href="/add" className={styles.add}>
        ＋ 게임 추가
      </Link>
    </aside>
  );
}

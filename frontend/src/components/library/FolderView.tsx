import type { SidebarGroup } from "@/lib/mock";
import type { BacklogCard } from "@/lib/types";
import Button from "@/components/common/Button";
import GameCard from "./GameCard";
import styles from "./FolderView.module.css";

type Props = {
  groups: SidebarGroup[];
  cards: BacklogCard[];
  /** null이면 폴더 목록, 값이 있으면 폴더 내부 */
  openFolder: string | null;
  onOpenFolder: (tag: string) => void;
  onCloseFolder: () => void;
  onSelect: (entryId: number) => void;
};

/** 폴더 = 태그. 중첩 폴더는 없다 (1단계만) */
export default function FolderView({
  groups,
  cards,
  openFolder,
  onOpenFolder,
  onCloseFolder,
  onSelect,
}: Props) {
  if (openFolder) {
    const group = groups.find((item) => item.tag === openFolder);
    const ids = new Set(group?.entries.map((entry) => entry.entryId) ?? []);
    const folderCards = cards.filter((card) => ids.has(card.entryId));

    return (
      <div className={styles.inside}>
        <header className={styles.insideHead}>
          <Button size="sm" variant="ghost" onClick={onCloseFolder}>
            ← 뒤로
          </Button>
          <h2 className={styles.folderTitle}>{openFolder}</h2>
          <span className={styles.count}>{folderCards.length} Games</span>
        </header>

        <div className={styles.cards}>
          {folderCards.map((card) => (
            <GameCard key={card.entryId} card={card} onSelect={onSelect} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.folders}>
      {groups.map((group) => (
        <button
          key={group.tag}
          type="button"
          className={styles.folder}
          onClick={() => onOpenFolder(group.tag)}
        >
          <span className={styles.folderName}>{group.tag}</span>
          <span className={styles.folderCount}>{group.entries.length} Games</span>
        </button>
      ))}
    </div>
  );
}

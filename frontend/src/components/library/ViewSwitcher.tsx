import styles from "./ViewSwitcher.module.css";

export type LibraryView = "detail" | "grid" | "folder";

const VIEWS: { key: LibraryView; label: string }[] = [
  { key: "detail", label: "상세" },
  { key: "grid", label: "그리드" },
  { key: "folder", label: "폴더" },
];

type Props = {
  view: LibraryView;
  onChange: (view: LibraryView) => void;
};

/** 페이지 이동이 아니라 본문 View 전환 */
export default function ViewSwitcher({ view, onChange }: Props) {
  return (
    <div className={styles.switcher} role="tablist" aria-label="보기 방식">
      {VIEWS.map((item) => (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={view === item.key}
          className={styles.tab}
          onClick={() => onChange(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

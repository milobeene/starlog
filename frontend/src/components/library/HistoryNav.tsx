import styles from "./LibraryToolbar.module.css";

/**
 * 라이브러리 전용 뒤로/앞으로. 브라우저 히스토리와 별개다.
 * 껍데기 단계에선 자리만 — 실제 스택은 브라우저 뒤로가기와의 충돌을 정리한 뒤에.
 */
export default function HistoryNav() {
  return (
    <div className={styles.history}>
      <button type="button" className={styles.historyBtn} disabled aria-label="뒤로">
        ←
      </button>
      <button type="button" className={styles.historyBtn} disabled aria-label="앞으로">
        →
      </button>
    </div>
  );
}

import HistoryNav from "./HistoryNav";
import styles from "./LibraryToolbar.module.css";

const PHASE6 = "Phase 6에서 붙입니다";

/** 검색·정렬·필터는 전부 비활성. 백엔드가 아직 없다 (L-1, L-2) */
export default function LibraryToolbar() {
  return (
    <div className={styles.toolbar}>
      <div className={styles.line}>
        <HistoryNav />

        <div className={styles.search} title={PHASE6}>
          <span className={styles.searchIcon} aria-hidden="true">
            🔍
          </span>
          <input
            type="search"
            className={styles.searchInput}
            placeholder="게임 검색"
            disabled
            aria-label="게임 검색"
          />
        </div>
      </div>

      <div className={styles.line}>
        <label className={styles.filter} title={PHASE6}>
          <span className={styles.filterLabel}>정렬</span>
          <select className={styles.select} disabled defaultValue="name">
            <option value="name">이름순</option>
            <option value="lastPlayed">최근 플레이순</option>
            <option value="rating">평점순</option>
            <option value="releasedOn">출시일순</option>
          </select>
        </label>

        <label className={styles.filter} title={PHASE6}>
          <span className={styles.filterLabel}>상태</span>
          <select className={styles.select} disabled defaultValue="">
            <option value="">전체</option>
          </select>
        </label>

        <label className={styles.filter} title={PHASE6}>
          <span className={styles.filterLabel}>장르</span>
          <select className={styles.select} disabled defaultValue="">
            <option value="">전체</option>
          </select>
        </label>

        <button type="button" className={styles.moreFilter} disabled title={PHASE6}>
          필터 ▾
        </button>
      </div>
    </div>
  );
}

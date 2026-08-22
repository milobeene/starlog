import SectionHeader from "@/components/common/SectionHeader";
import styles from "./StatisticsPlaceholder.module.css";

/** 차트 라이브러리는 Phase 6(L-5)까지 도입하지 않는다. 자리만 잡아둔다 */
export default function StatisticsPlaceholder() {
  return (
    <section className={styles.section}>
      <SectionHeader title="플레이 기록 / 통계" hint="Phase 6에서 채웁니다" />
      <div className={styles.grid}>
        <div className={styles.box}>
          <span className={styles.caption}>장르별 분포</span>
        </div>
        <div className={styles.box}>
          <span className={styles.caption}>월별 완료 수</span>
        </div>
      </div>
    </section>
  );
}

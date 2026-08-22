import Link from "next/link";
import { MOCK_ME, MOCK_TOTAL, statusCount } from "@/lib/mock";
import styles from "./page.module.css";

/** 보여주는 공간. 수정은 /settings 에서 한다 */
export default function ProfilePage() {
  const { nickname, email, memo } = MOCK_ME.profile;

  return (
    <main className={styles.page}>
      <section className={styles.identity}>
        {/* 프로필 사진 업로드는 백엔드에 없다 (Phase 5 스토리지와 함께) */}
        <div className={styles.avatar} aria-hidden="true">
          {nickname.charAt(0)}
        </div>
        <span className={styles.avatarNote}>사진 업로드는 준비 중입니다</span>
        <h1 className={styles.nickname}>{nickname}</h1>
        <p className={styles.email}>{email}</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>자기소개 / 메모</h2>
        <p className={styles.memo}>{memo ?? "아직 소개가 없습니다"}</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Library Summary</h2>
        <div className={styles.summary}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryValue}>{MOCK_TOTAL}</span>
            <span className={styles.summaryLabel}>Games</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryValue}>{statusCount("COMPLETED")}</span>
            <span className={styles.summaryLabel}>Completed</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryValue}>{statusCount("PLAYING")}</span>
            <span className={styles.summaryLabel}>Playing</span>
          </div>
        </div>

        <div className={styles.edit}>
          <Link href="/settings" className={styles.editLink}>
            설정에서 수정하기 →
          </Link>
        </div>
      </section>
    </main>
  );
}

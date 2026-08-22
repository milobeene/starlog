import Link from "next/link";
import { MOCK_ME } from "@/lib/mock";
import NavPopup from "./NavPopup";
import styles from "./AppHeader.module.css";

export default function AppHeader() {
  const { nickname } = MOCK_ME.profile;

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        {/* 사용자 식별 영역 — 프로필 사진은 백엔드에 없다 (Phase 5). 이니셜로 대체 */}
        <Link href="/profile" className={styles.user}>
          <span className={styles.avatar} aria-hidden="true">
            {nickname.charAt(0)}
          </span>
          <span className={styles.nickname}>{nickname}</span>
        </Link>

        <Link href="/" className={styles.logo}>
          Game Backlog <span className={styles.logoMark}>MiloBeene®</span>
        </Link>

        <NavPopup />
      </div>
    </header>
  );
}

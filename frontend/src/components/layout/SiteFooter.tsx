import styles from "./SiteFooter.module.css";

/**
 * RAWG 라이선스 조건 — 데이터를 쓰는 페이지에 출처 표기와 **활성 하이퍼링크**가 필수다.
 * 권고가 아니라 조건이라 초기부터 넣는다 (스펙 §8.1).
 */
export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <p className={styles.text}>
        게임 데이터 제공:{" "}
        <a
          href="https://rawg.io"
          className={styles.link}
          target="_blank"
          rel="noreferrer"
        >
          RAWG Video Games Database
        </a>
      </p>
      <p className={styles.sub}>Game Backlog MiloBeene® — 개인 학습용 습작</p>
    </footer>
  );
}

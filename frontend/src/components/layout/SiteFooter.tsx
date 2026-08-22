import styles from "./SiteFooter.module.css";

/**
 * 데이터 출처 표기.
 *
 * v1.5까지는 RAWG 라이선스가 "데이터를 쓰는 모든 페이지에 활성 하이퍼링크 필수"를
 * **조건으로** 걸어서 반드시 있어야 했다. IGDB(Twitch Developer Services Agreement)에는
 * 그런 의무 조항이 없다 (스펙 §8.1). 그래도 남겨두는 이유는 예의고, 지워도 무방하다
 */
export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <p className={styles.text}>
        게임 데이터 제공:{" "}
        <a
          href="https://www.igdb.com"
          className={styles.link}
          target="_blank"
          rel="noreferrer"
        >
          IGDB
        </a>
      </p>
      <p className={styles.sub}>Game Backlog MiloBeene® — 개인 학습용 습작</p>
    </footer>
  );
}

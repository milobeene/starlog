import GameSearch from "@/components/add/GameSearch";
import styles from "../page.module.css";

export default function AddPage() {
  return (
    <main className={`${styles.page} ${styles.narrow}`}>
      <h1 className={styles.pageTitle}>게임 추가</h1>
      <GameSearch />
    </main>
  );
}

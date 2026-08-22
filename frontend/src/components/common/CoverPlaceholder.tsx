/* eslint-disable @next/next/no-img-element */
import styles from "./CoverPlaceholder.module.css";

type Props = {
  ratio?: "cover" | "wide" | "square";
};

/**
 * 커버 이미지는 Phase 5(K) 전까지 항상 null이다. 그동안 쓰는 디폴트 이미지.
 * next/image가 아니라 <img>인 이유 — 정적 export에서 최적화 서버가 없다.
 */
export default function CoverPlaceholder({ ratio = "cover" }: Props) {
  return (
    <div className={`${styles.box} ${styles[ratio]}`}>
      <img src="/default-cover.png" alt="" className={styles.image} />
    </div>
  );
}

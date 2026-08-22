import styles from "./DashboardHeader.module.css";

type Props = {
  nickname: string;
};

export default function DashboardHeader({ nickname }: Props) {
  return (
    <section className={styles.hero}>
      <div className={styles.avatar} aria-hidden="true">
        {nickname.charAt(0)}
      </div>
      <div>
        <h1 className={styles.greeting}>안녕하세요, {nickname}님</h1>
        <p className={styles.sub}>당신의 게임 라이브러리</p>
      </div>
    </section>
  );
}

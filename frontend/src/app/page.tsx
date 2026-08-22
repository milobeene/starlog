import DashboardHeader from "@/components/dashboard/DashboardHeader";
import OverviewStats from "@/components/dashboard/OverviewStats";
import RecentGames from "@/components/dashboard/RecentGames";
import StatisticsPlaceholder from "@/components/dashboard/StatisticsPlaceholder";
import SiteFooter from "@/components/layout/SiteFooter";
import { MOCK_ME, MOCK_RECENT } from "@/lib/mock";
import styles from "./page.module.css";

export default function DashboardPage() {
  return (
    <main className={styles.page}>
      <DashboardHeader nickname={MOCK_ME.profile.nickname} />
      <div className={styles.divider} />
      <OverviewStats />
      <div className={styles.divider} />
      <RecentGames cards={MOCK_RECENT} />
      <div className={styles.divider} />
      <StatisticsPlaceholder />
      <SiteFooter />
    </main>
  );
}

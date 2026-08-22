import ProfileSection from "@/components/settings/ProfileSection";
import PlatformAccountTable from "@/components/settings/PlatformAccountTable";
import DeviceTable from "@/components/settings/DeviceTable";
import SubscriptionTable from "@/components/settings/SubscriptionTable";
import DictionarySection from "@/components/settings/DictionarySection";
import { MOCK_GENRE_FACETS, MOCK_ME, MOCK_TAG_FACETS } from "@/lib/mock";
import styles from "../page.module.css";

export default function SettingsPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.pageTitle}>설정</h1>

      <ProfileSection profile={MOCK_ME.profile} />
      <PlatformAccountTable accounts={MOCK_ME.platformAccounts} />
      <DeviceTable devices={MOCK_ME.devices} />
      <SubscriptionTable subscriptions={MOCK_ME.subscriptions} />
      <DictionarySection tags={MOCK_TAG_FACETS} genres={MOCK_GENRE_FACETS} />
    </main>
  );
}

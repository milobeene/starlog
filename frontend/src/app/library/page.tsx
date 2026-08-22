import LibraryShell from "@/components/library/LibraryShell";
import { MOCK_CARDS, MOCK_DETAILS, MOCK_SIDEBAR, groupByTag } from "@/lib/mock";

export default function LibraryPage() {
  return (
    <LibraryShell
      groups={groupByTag(MOCK_SIDEBAR)}
      cards={MOCK_CARDS}
      details={MOCK_DETAILS}
    />
  );
}

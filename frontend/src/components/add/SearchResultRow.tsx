"use client";

import type { GameSearchResult } from "@/lib/types";
import type { MockAddOutcome } from "@/lib/mock";
import Button from "@/components/common/Button";
import { SOURCE_LABEL, formatDate } from "@/lib/labels";
import styles from "./GameSearch.module.css";

type Props = {
  result: GameSearchResult & { outcome: MockAddOutcome };
  message: string | null;
  onAdd: () => void;
};

export default function SearchResultRow({ result, message, onAdd }: Props) {
  return (
    <li className={styles.row}>
      <div className={styles.rowText}>
        <span className={styles.rowName}>{result.name}</span>
        <span className={styles.rowMeta}>
          {formatDate(result.releasedOn)} · {SOURCE_LABEL[result.source]}
        </span>
        {message && <span className={styles.rowMessage}>{message}</span>}
      </div>

      <Button size="sm" variant="primary" onClick={onAdd}>
        담기
      </Button>
    </li>
  );
}

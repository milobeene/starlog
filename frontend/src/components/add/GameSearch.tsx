"use client";

import { useState } from "react";
import Button from "@/components/common/Button";
import EmptyState from "@/components/common/EmptyState";
import ReviveConfirmDialog from "@/components/common/ReviveConfirmDialog";
import SearchResultRow from "./SearchResultRow";
import { MOCK_SEARCH_RESULTS } from "@/lib/mock";
import styles from "./GameSearch.module.css";

/**
 * 검색은 GET /api/games?q= — 로컬 마스터만, 상위 20건 (외부 DB는 Phase 4).
 * 담기 결과는 3분기: 성공 / 이미 담음 / 삭제했던 게임 → 되살리기 확인.
 */
export default function GameSearch() {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<Record<number, string>>({});
  const [reviveTarget, setReviveTarget] = useState<string | null>(null);

  const results = MOCK_SEARCH_RESULTS;

  function handleAdd(gameId: number, name: string, outcome: string) {
    if (outcome === "revivable") {
      setReviveTarget(name);
      return;
    }
    setMessages((prev) => ({
      ...prev,
      [gameId]:
        outcome === "duplicated" ? "이미 담은 게임입니다" : "라이브러리에 담았습니다",
    }));
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.searchBar}>
        <input
          className={styles.searchInput}
          placeholder="게임 이름을 입력하세요"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="게임 이름"
        />
        <Button variant="primary">🔍 검색</Button>
      </div>

      <section className={styles.results}>
        <h2 className={styles.resultsHead}>검색 결과</h2>

        {results.length === 0 ? (
          <EmptyState
            message="검색 결과가 없습니다"
            action={<Button disabled>게임 직접 등록</Button>}
          />
        ) : (
          <ul className={styles.list}>
            {results.map((result) => (
              <SearchResultRow
                key={result.gameId}
                result={result}
                message={messages[result.gameId] ?? null}
                onAdd={() => handleAdd(result.gameId, result.name, result.outcome)}
              />
            ))}
          </ul>
        )}
      </section>

      <footer className={styles.fallback}>
        <p className={styles.fallbackText}>검색 결과가 없나요?</p>
        {/* 수동 등록은 Phase 4(J-4) */}
        <Button disabled title="Phase 4에서 붙입니다">
          게임 직접 등록
        </Button>
      </footer>

      <ReviveConfirmDialog
        open={reviveTarget !== null}
        targetName={reviveTarget ?? ""}
        kind="backlog"
        onClose={() => setReviveTarget(null)}
      />
    </div>
  );
}

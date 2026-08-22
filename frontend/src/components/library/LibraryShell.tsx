"use client";

import { useState } from "react";
import type { BacklogCard, BacklogDetail } from "@/lib/types";
import type { SidebarGroup } from "@/lib/mock";
import EmptyState from "@/components/common/EmptyState";
import LibrarySidebar from "./LibrarySidebar";
import LibraryToolbar from "./LibraryToolbar";
import ViewSwitcher, { type LibraryView } from "./ViewSwitcher";
import DetailView from "./DetailView";
import GridView from "./GridView";
import FolderView from "./FolderView";
import styles from "./LibraryShell.module.css";
import Link from "next/link";

type Props = {
  groups: SidebarGroup[];
  cards: BacklogCard[];
  details: (BacklogDetail & { tags: string[] })[];
};

export default function LibraryShell({ groups, cards, details }: Props) {
  const [view, setView] = useState<LibraryView>("detail");
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(
    details[0]?.entryId ?? null,
  );
  const [openFolder, setOpenFolder] = useState<string | null>(null);

  const detail = details.find((item) => item.entryId === selectedEntryId) ?? null;

  /** 그리드·폴더에서 게임을 고르면 상세로 전환되고 탭 active도 상세로 옮겨간다 */
  function selectGame(entryId: number) {
    setSelectedEntryId(entryId);
    setView("detail");
  }

  return (
    /* 사이드바와 본문은 형제다. aside가 main을 감싸면 모바일 서랍 전환을 CSS로 못 한다 */
    <div className={styles.layout}>
      <LibrarySidebar
        groups={groups}
        selectedEntryId={selectedEntryId}
        onSelect={selectGame}
      />

      <main className={styles.main}>
        <LibraryToolbar />

        <div className={styles.viewBar}>
          <ViewSwitcher
            view={view}
            onChange={(next) => {
              setView(next);
              if (next !== "folder") setOpenFolder(null);
            }}
          />
        </div>

        <div className={styles.viewport}>
          {view === "detail" &&
            (detail ? (
              <DetailView detail={detail} />
            ) : (
              <EmptyState
                message="담은 게임이 없습니다"
                action={<Link href="/add">게임 추가하기</Link>}
              />
            ))}

          {view === "grid" && <GridView cards={cards} onSelect={selectGame} />}

          {view === "folder" && (
            <FolderView
              groups={groups}
              cards={cards}
              openFolder={openFolder}
              onOpenFolder={setOpenFolder}
              onCloseFolder={() => setOpenFolder(null)}
              onSelect={selectGame}
            />
          )}
        </div>
      </main>
    </div>
  );
}

"use client";

import { useState } from "react";
import type { BacklogDetail } from "@/lib/types";
import Button from "@/components/common/Button";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import GameHeader from "./GameHeader";
import GameInfoSection from "./GameInfoSection";
import PersonalRecordSection from "./PersonalRecordSection";
import TagGenreSection from "./TagGenreSection";
import PlaythroughSection from "./PlaythroughSection";
import AcquisitionSection from "./AcquisitionSection";
import styles from "./DetailView.module.css";

type Props = {
  detail: BacklogDetail & { tags: string[] };
};

/**
 * 섹션별 편집. 쓰기 API가 리소스 단위로 쪼개져 있어서
 * 전역 [저장] 하나면 요청 여러 개 중 하나만 실패했을 때 반만 저장된다.
 */
export default function DetailView({ detail }: Props) {
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <article className={styles.detail}>
      <GameHeader detail={detail} />

      <GameInfoSection detail={detail} />
      <PersonalRecordSection record={detail.personalRecord} />
      <TagGenreSection
        tags={detail.tags}
        genres={detail.genres}
        resolvedGenres={detail.resolved.genres}
      />
      <PlaythroughSection playthroughs={detail.playthroughs} />
      <AcquisitionSection acquisitions={detail.acquisitions} />

      <footer className={styles.dangerZone}>
        <Button variant="danger" onClick={() => setDeleteOpen(true)}>
          항목 삭제
        </Button>
      </footer>

      <ConfirmDialog
        open={deleteOpen}
        title="이 항목을 삭제할까요?"
        description={`"${detail.resolved.name}" — 소프트 삭제라 나중에 같은 게임을 다시 담으면 되살릴 수 있습니다.`}
        onClose={() => setDeleteOpen(false)}
      />
    </article>
  );
}

"use client";

import { useState } from "react";
import type { PersonalRecord } from "@/lib/types";
import Button from "@/components/common/Button";
import InfoRow from "@/components/common/InfoRow";
import SectionHeader from "@/components/common/SectionHeader";
import { formatRating } from "@/lib/labels";
import form from "@/components/common/form.module.css";
import styles from "./DetailView.module.css";

type Props = {
  record: PersonalRecord;
};

/** PUT /api/backlog/{id}/personal-record */
export default function PersonalRecordSection({ record }: Props) {
  const [editing, setEditing] = useState(false);

  return (
    <section className={styles.section}>
      <SectionHeader
        title="개인 기록"
        action={
          !editing && (
            <Button size="sm" onClick={() => setEditing(true)}>
              편집
            </Button>
          )
        }
      />

      {editing ? (
        <div className={form.stack}>
          <div className={form.grid2}>
            <label className={form.field}>
              <span className={form.label}>평점 (0 ~ 100)</span>
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                className={form.input}
                defaultValue={record.rating ?? ""}
              />
            </label>
            <label className={form.field}>
              <span className={form.label}>플레이 시간 (시간)</span>
              <input
                type="number"
                min={0}
                className={form.input}
                defaultValue={record.playTimeHours ?? ""}
              />
            </label>
          </div>

          <label className={form.field}>
            <span className={form.label}>메모</span>
            <textarea
              className={form.textarea}
              maxLength={2000}
              defaultValue={record.memo ?? ""}
            />
            <span className={form.hint}>최대 2000자</span>
          </label>

          <div className={form.actions}>
            <Button size="sm" onClick={() => setEditing(false)}>
              취소
            </Button>
            <Button size="sm" variant="primary" onClick={() => setEditing(false)}>
              저장
            </Button>
          </div>
        </div>
      ) : (
        <dl className={styles.infoList}>
          <InfoRow label="평점">{formatRating(record.rating)} / 100</InfoRow>
          <InfoRow label="플레이 시간">
            {record.playTimeHours != null ? `${record.playTimeHours}시간` : "—"}
          </InfoRow>
          <InfoRow label="메모">{record.memo ?? "—"}</InfoRow>
        </dl>
      )}
    </section>
  );
}

"use client";

import { useState } from "react";
import Button from "@/components/common/Button";
import SectionHeader from "@/components/common/SectionHeader";
import form from "@/components/common/form.module.css";
import styles from "./DetailView.module.css";

type Props = {
  tags: string[];
  genres: string[];
  /** 개인 장르가 없으면 마스터 장르로 폴백된 값 */
  resolvedGenres: string[];
};

/** PUT /api/backlog/{id}/tags, /genres — 둘 다 전체 교체 */
export default function TagGenreSection({ tags, genres, resolvedGenres }: Props) {
  const [editing, setEditing] = useState(false);

  return (
    <section className={styles.section}>
      <SectionHeader
        title="태그 / 장르"
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
          <label className={form.field}>
            <span className={form.label}>태그 (쉼표로 구분)</span>
            <input className={form.input} defaultValue={tags.join(", ")} />
            <span className={form.hint}>
              등록 절차가 없습니다. 적으면 만들어지고, 아무 항목에도 안 붙으면 목록에서 사라집니다.
            </span>
          </label>

          <label className={form.field}>
            <span className={form.label}>장르 (쉼표로 구분)</span>
            <input className={form.input} defaultValue={genres.join(", ")} />
            <span className={form.hint}>비우면 마스터 장르가 대신 표시됩니다.</span>
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
          <div className={styles.chipRow}>
            <dt className={styles.chipLabel}>태그</dt>
            <dd className={styles.chips}>
              {tags.length > 0 ? (
                tags.map((tag) => (
                  <span key={tag} className={styles.chip}>
                    {tag}
                  </span>
                ))
              ) : (
                <span className={styles.muted}>태그 없음</span>
              )}
            </dd>
          </div>

          <div className={styles.chipRow}>
            <dt className={styles.chipLabel}>장르</dt>
            <dd className={styles.chips}>
              {resolvedGenres.length > 0 ? (
                resolvedGenres.map((genre) => (
                  <span key={genre} className={`${styles.chip} ${styles.chipQuiet}`}>
                    {genre}
                    {genres.includes(genre) ? "" : " (마스터)"}
                  </span>
                ))
              ) : (
                <span className={styles.muted}>장르 없음</span>
              )}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}

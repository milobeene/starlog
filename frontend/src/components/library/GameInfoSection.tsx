"use client";

import { useState } from "react";
import type { BacklogDetail } from "@/lib/types";
import Button from "@/components/common/Button";
import InfoRow from "@/components/common/InfoRow";
import SectionHeader from "@/components/common/SectionHeader";
import { SOURCE_LABEL, formatDate, formatList, formatMoney } from "@/lib/labels";
import form from "@/components/common/form.module.css";
import styles from "./DetailView.module.css";

type Props = {
  detail: BacklogDetail;
};

/** PUT /api/backlog/{id}/overrides — 전체 교체. 비우면 마스터 값으로 되돌아간다 */
export default function GameInfoSection({ detail }: Props) {
  const [editing, setEditing] = useState(false);
  const { resolved, master, overrides } = detail;

  return (
    <section className={styles.section}>
      <SectionHeader
        title="게임 정보"
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
            <span className={form.label}>게임명</span>
            <input
              className={form.input}
              defaultValue={overrides.name ?? ""}
              placeholder={master.name}
            />
          </label>

          <div className={form.grid2}>
            <label className={form.field}>
              <span className={form.label}>개발사 (쉼표로 구분)</span>
              <input
                className={form.input}
                defaultValue={overrides.developers.join(", ")}
                placeholder={master.developers.join(", ")}
              />
            </label>
            <label className={form.field}>
              <span className={form.label}>퍼블리셔 (쉼표로 구분)</span>
              <input
                className={form.input}
                defaultValue={overrides.publishers.join(", ")}
                placeholder={master.publishers.join(", ")}
              />
            </label>
          </div>

          <div className={form.grid3}>
            <label className={form.field}>
              <span className={form.label}>출시일</span>
              <input
                type="date"
                className={form.input}
                defaultValue={overrides.releasedOn ?? ""}
              />
            </label>
            <label className={form.field}>
              <span className={form.label}>정가</span>
              <input
                type="number"
                className={form.input}
                defaultValue={overrides.listPrice?.amount ?? ""}
              />
            </label>
            <label className={form.field}>
              <span className={form.label}>통화</span>
              <select
                className={form.select}
                defaultValue={overrides.listPrice?.currency ?? "KRW"}
              >
                <option value="KRW">KRW</option>
                <option value="USD">USD</option>
                <option value="JPY">JPY</option>
              </select>
            </label>
          </div>

          <p className={form.hint}>비워두면 마스터 값을 그대로 씁니다.</p>

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
          <InfoRow
            label="게임명"
            masterHint={overrides.name ? master.name : null}
          >
            {resolved.name}
          </InfoRow>
          <InfoRow label="개발사">{formatList(resolved.developers)}</InfoRow>
          <InfoRow label="퍼블리셔">{formatList(resolved.publishers)}</InfoRow>
          <InfoRow label="출시일">{formatDate(resolved.releasedOn)}</InfoRow>
          {/* IGDB는 가격을 주지 않는다 → 마스터 정가 힌트를 띄울 자리가 없다 */}
          <InfoRow label="정가">{formatMoney(resolved.listPrice)}</InfoRow>
          {/* "평균 플레이 시간"이 아니라 "클리어 소요 시간"이다 — 지표의 의미가 다르다 (스펙 §6.2) */}
          <InfoRow label="클리어 소요 시간" note="IGDB 이용자 평균">
            {master.timeToBeatHours != null
              ? `약 ${master.timeToBeatHours}시간`
              : "—"}
          </InfoRow>
          <InfoRow label="출처">{SOURCE_LABEL[master.source]}</InfoRow>
        </dl>
      )}
    </section>
  );
}

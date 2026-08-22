"use client";

import { useState } from "react";
import type { FacetCount } from "@/lib/types";
import Button from "@/components/common/Button";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import Dialog from "@/components/common/Dialog";
import SettingsSection from "./SettingsSection";
import form from "@/components/common/form.module.css";
import styles from "./Settings.module.css";

type Props = {
  tags: FacetCount[];
  genres: FacetCount[];
};

type Target = { kind: "tag" | "genre"; item: FacetCount };

/**
 * 소멸 방식이 두 개다.
 *  - 자동 소멸: 어느 항목에도 안 붙으면 목록에서 안 보인다. 행은 남고 같은 이름을 다시 적으면 재사용된다
 *  - 명시적 삭제(DELETE): 연결을 전부 끊고 행도 지운다 → 확인 다이얼로그 필수
 */
export default function DictionarySection({ tags, genres }: Props) {
  const [renameTarget, setRenameTarget] = useState<Target | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Target | null>(null);

  function renderChips(items: FacetCount[], kind: "tag" | "genre") {
    return (
      <div className={styles.chips}>
        {items.map((item) => (
          <span key={`${kind}-${item.id}`} className={styles.chip}>
            <span className={styles.chipName}>{item.name}</span>
            <span className={styles.chipCount}>{item.count}</span>
            <button
              type="button"
              className={styles.chipBtn}
              aria-label={`${item.name} 이름 변경`}
              onClick={() => setRenameTarget({ kind, item })}
            >
              ✎
            </button>
            <button
              type="button"
              className={styles.chipBtn}
              aria-label={`${item.name} 삭제`}
              onClick={() => setDeleteTarget({ kind, item })}
            >
              ✕
            </button>
          </span>
        ))}
      </div>
    );
  }

  const deleteDescription =
    deleteTarget?.kind === "tag"
      ? `"${deleteTarget.item.name}" 태그를 삭제하면 ${deleteTarget.item.count}개 항목에서 제거됩니다.`
      : `"${deleteTarget?.item.name ?? ""}" 장르를 삭제하면 ${deleteTarget?.item.count ?? 0}개 항목이 마스터 장르로 되돌아갑니다.`;

  return (
    <SettingsSection title="태그 / 장르 사전" hint="숫자는 붙어 있는 항목 수">
      <div className={form.stack}>
        <div>
          <p className={styles.dictNote}>태그</p>
          {renderChips(tags, "tag")}
        </div>

        <div>
          <p className={styles.dictNote}>개인 장르</p>
          {renderChips(genres, "genre")}
        </div>

        <p className={styles.dictNote}>
          아무 항목에도 안 붙은 이름은 목록에서 저절로 사라집니다. 같은 이름을 다시 적으면 그대로
          재사용됩니다. ✕ 삭제는 붙어 있는 항목 전부에서 떼어내는 별개의 작업입니다.
        </p>
      </div>

      <Dialog
        open={renameTarget !== null}
        title={renameTarget?.kind === "tag" ? "태그 이름 변경" : "장르 이름 변경"}
        onClose={() => setRenameTarget(null)}
        footer={
          <>
            <Button onClick={() => setRenameTarget(null)}>취소</Button>
            <Button variant="primary" onClick={() => setRenameTarget(null)}>
              저장
            </Button>
          </>
        }
      >
        <label className={form.field}>
          <span className={form.label}>이름</span>
          <input
            key={renameTarget?.item.id}
            className={form.input}
            defaultValue={renameTarget?.item.name ?? ""}
          />
        </label>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={deleteTarget?.kind === "tag" ? "태그를 삭제할까요?" : "장르를 삭제할까요?"}
        description={deleteDescription}
        onClose={() => setDeleteTarget(null)}
      />
    </SettingsSection>
  );
}

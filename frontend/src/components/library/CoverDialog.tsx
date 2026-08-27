"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import DropZone from "@/components/media/DropZone";
import { Button } from "@/components/ui/Field";
import { api, ApiError, errorMessage } from "@/lib/api";
import { uploadCover } from "@/lib/upload";
import type { CoverInfo } from "@/lib/types";

/**
 * 커버 업로드 (v1.0 6단계에서 다시 만듦).
 *
 * ## 🐛 예전에 무엇이 잘못됐나
 *
 * `<input type="file">` 하나뿐인데 박스를 넓게 스타일링해둬서 **아무 데나 눌러도 될 것처럼
 * 보였고**, 실제로는 왼쪽의 작은 기본 버튼만 동작했다. 드래그앤드롭은 아예 없었다.
 * → `DropZone`으로 갈아끼웠다 (드롭·클릭·붙여넣기).
 *
 * ## 업로드 경로가 둘이다
 *
 * 어디에 올릴지는 **서버가 정한다** (`lib/upload.ts`). 자격증명이 있는지, 체크박스가
 * 켜졌는지가 전부 서버에만 있어서, 화면이 판정하려면 설정을 또 내려받아야 한다.
 *
 * ## 고르자마자 올린다
 *
 * 예전에는 고르고 [올리기]를 또 눌러야 했다. 드롭으로 놓는 동작 자체가 이미 "이걸 쓰겠다"는
 * 뜻이라 확인을 한 번 더 받는 게 어색하다 — 되돌리려면 다시 고르면 된다
 */
export default function CoverDialog({
  entryId,
  cover,
  onClose,
  onSaved,
}: {
  entryId: number;
  cover: CoverInfo;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handle = async (files: File[]) => {
    const file = files[0];
    if (!file) return;

    setBusy(true);
    setError(null);
    try {
      await uploadCover(entryId, file);
      onSaved();
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : String(caught));
      setBusy(false);
    }
  };

  const removeCover = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.del(`/api/backlog/${entryId}/cover`);
      onSaved();
      onClose();
    } catch (caught) {
      setError(errorMessage(caught, "삭제하지 못했습니다. 잠시 후 다시 시도해 주세요."));
      setBusy(false);
    }
  };

  return (
    <Modal
      title="커버 이미지 변경"
      onClose={onClose}
      footer={
        <>
          {error && (
            <span className="mr-auto max-w-[55%] truncate text-xs text-red-400" title={error}>
              {error}
            </span>
          )}
          {cover.source === "PERSONAL" && (
            <Button variant="danger" onClick={removeCover} disabled={busy}>
              커버 삭제
            </Button>
          )}
          <Button onClick={onClose}>닫기</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-[11px] leading-relaxed text-white/45">
          현재 커버는{" "}
          <span className="text-white/70">
            {cover.source === "PERSONAL"
              ? "직접 올린 이미지"
              : cover.source === "MASTER"
                ? "IGDB 이미지"
                : "없음"}
          </span>
          입니다. 직접 올리신 이미지는 IGDB 커버를 대신하며, 삭제하시면 다시 IGDB 이미지로
          돌아갑니다.
        </p>

        <DropZone onFiles={handle} disabled={busy} hint="붙여넣기(⌘V)도 됩니다 · 5MB 이하">
          {busy ? <p className="text-sm text-white/60">올리는 중…</p> : undefined}
        </DropZone>
      </div>
    </Modal>
  );
}

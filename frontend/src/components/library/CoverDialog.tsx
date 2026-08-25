"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Field";
import { api, ApiError, errorMessage } from "@/lib/api";
import type { CoverInfo } from "@/lib/types";

/**
 * 커버 업로드 — **3단계다** (스펙 §6.10, K-1~K-5).
 *
 *   1. 서버에 presigned URL 요청 (파일명·크기를 서버가 먼저 검증)
 *   2. 그 URL로 스토리지에 **직접** PUT — 파일이 우리 서버를 안 거친다
 *   3. storageKey를 서버에 확정 통보
 *
 * 2단계가 우리 API가 아니라서 `api` 래퍼를 안 쓴다 (CSRF 헤더도 붙이면 안 된다).
 * 로컬에서는 스토리지가 설정돼 있지 않아 1단계에서 막힌다 — 그때 에러가 그대로 뜬다
 */
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

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
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async () => {
    if (!file) return;
    if (!ALLOWED.includes(file.type)) {
      setError("JPG · PNG · WebP 형식만 업로드하실 수 있습니다");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("5MB 이하만 업로드하실 수 있습니다");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const ticket = await api.post<{ uploadUrl: string; storageKey: string; contentType: string }>(
        `/api/backlog/${entryId}/cover/upload-url`,
        { fileName: file.name, sizeBytes: file.size },
      );

      const uploaded = await fetch(ticket.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": ticket.contentType },
        body: file,
      });
      if (!uploaded.ok) throw new Error(`이미지 업로드에 실패했습니다 (${uploaded.status})`);

      await api.put(`/api/backlog/${entryId}/cover`, { storageKey: ticket.storageKey });
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
          {error && <span className="mr-auto max-w-[55%] truncate text-xs text-red-400" title={error}>{error}</span>}
          {cover.source === "PERSONAL" && (
            <Button variant="danger" onClick={removeCover} disabled={busy}>
              커버 삭제
            </Button>
          )}
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" onClick={upload} disabled={busy || !file}>
            {busy ? "업로드 중" : "올리기"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-[11px] leading-relaxed text-white/45">
          현재 커버는{" "}
          <span className="text-white/70">
            {cover.source === "PERSONAL" ? "직접 올린 이미지" : cover.source === "MASTER" ? "IGDB 이미지" : "없음"}
          </span>
          입니다. 직접 올리신 이미지는 IGDB 커버를 대신하며, 삭제하시면 다시 IGDB 이미지로 돌아갑니다.
        </p>

        <input
          type="file"
          accept={ALLOWED.join(",")}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setError(null);
          }}
          className="w-full rounded-md border border-white/10 bg-white/5 p-3 text-sm text-white/70 file:mr-3 file:rounded file:border-0 file:bg-white/15 file:px-3 file:py-1.5 file:text-xs file:text-white hover:file:bg-white/25"
        />

        <p className="text-[11px] text-white/30">JPG · PNG · WebP · 5MB 이하</p>
      </div>
    </Modal>
  );
}

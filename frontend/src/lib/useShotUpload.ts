"use client";

import { useState } from "react";
import { errorMessage } from "@/lib/api";
import { getIngestBridge } from "@/lib/ingest";
import { uploadScreenshot } from "@/lib/upload";

/**
 * 스크린샷 넣기 — 상세의 구역과 스크린샷 화면이 같이 쓴다.
 *
 * 경로가 있는 파일(탐색기에서 끌어온 것)은 메인이 직접 복사한다 — 브라우저로 통째로 올리면
 * 수백 MB 영상은 메모리와 시간을 먹고 한도에도 걸린다. 경로가 없는 것(클립보드)만 HTTP로 간다.
 * 하나가 실패해도 나머지는 계속 올리고, 실패는 모아서 이유와 함께 보인다
 */
export function useShotUpload(entryId: number, onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 올리다 실패한 파일들 */
  const [failed, setFailed] = useState<{ name: string; reason: string }[]>([]);

  const add = async (files: File[]) => {
    setBusy(true);
    setError(null);
    setFailed([]);
    try {
      const bridge = getIngestBridge();
      const withPath: { file: File; path: string }[] = [];
      const rest: File[] = [];
      for (const file of files) {
        const path = bridge?.pathOf(file) || null;
        if (path) withPath.push({ file, path });
        else rest.push(file);
      }

      if (bridge && withPath.length > 0) {
        try {
          await bridge.ingest({
            entryId,
            sources: withPath.map((x) => x.path),
            // 원본 시각 — 서버가 이 순서로 번호를 붙인다
            takenAt: Object.fromEntries(withPath.map((x) => [x.path, x.file.lastModified])),
          });
        } catch (caught) {
          setError(errorMessage(caught, "넣지 못했습니다."));
        }
      }

      // 한 장씩 순서대로 — 동시에 보내면 서버가 붙이는 번호가 겹친다
      const bad: { name: string; reason: string }[] = [];
      for (const file of rest) {
        try {
          await uploadScreenshot(entryId, file, file.lastModified);
        } catch (caught) {
          bad.push({ name: file.name || "(이름 없음)", reason: errorMessage(caught, "올리지 못했습니다.") });
        }
      }
      setFailed(bad);
    } finally {
      // 중간에 실패해도 앞에서 올라간 것은 보여야 한다
      onDone();
      setBusy(false);
    }
  };

  return { add, busy, error, failed, clearFailed: () => setFailed([]) };
}

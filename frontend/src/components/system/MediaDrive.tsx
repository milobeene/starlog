"use client";

import { useCallback, useEffect, useState } from "react";
import Bytes from "@/components/ui/Bytes";
import { FIELD_INPUT } from "@/components/ui/Field";
import { errorMessage } from "@/lib/api";
import { getIngestBridge } from "@/lib/ingest";

const LABEL_MAX = 40;

/**
 * 스크린샷이 쌓이는 드라이브 (2.1.0). 남은 공간은 넣기 전에 메인이 검사하는 값과 같은 것이다 —
 * 수 GB 영상을 넣다 중간에 막히기 전에 여기서 미리 보이게 한다.
 * 이름은 사용자가 붙인다(데이터 루트 경로별로 저장). 안 붙이면 `D:\` 같은 루트를 보인다.
 * 일렉트론에서만 뜻이 있다 — 브라우저는 디스크를 못 잰다
 */
export default function MediaDrive() {
  const [info, setInfo] = useState<{ root: string; label: string | null; freeBytes: number; totalBytes: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getIngestBridge()
      ?.driveInfo()
      .then(setInfo)
      .catch(() => {});
  }, []);
  useEffect(load, [load]);

  if (!getIngestBridge() || !info) return null;

  const save = async () => {
    const label = draft.trim();
    try {
      await getIngestBridge()?.setDriveLabel(label === "" ? null : label);
      setEditing(false);
      setError(null);
      load();
    } catch (caught) {
      setError(errorMessage(caught, "이름을 바꾸지 못했습니다."));
    }
  };

  const used = Math.max(0, info.totalBytes - info.freeBytes);
  const ratio = info.totalBytes > 0 ? Math.min(1, used / info.totalBytes) : 0;

  return (
    <div className="mt-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3">
      <div className="text-[10px] font-semibold tracking-widest text-white/40 uppercase">스크린샷 드라이브</div>
      <div className="mt-1 flex items-center gap-2">
        {editing ? (
          <>
            <input
              autoFocus
              value={draft}
              maxLength={LABEL_MAX}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void save();
                if (e.key === "Escape") setEditing(false);
              }}
              placeholder={info.root}
              className={`${FIELD_INPUT} max-w-xs !py-1`}
            />
            <button type="button" onClick={() => void save()} className="text-xs text-white/70 hover:text-white">
              저장
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-xs text-white/35 hover:text-white">
              취소
            </button>
          </>
        ) : (
          <>
            <span className="min-w-0 truncate text-sm text-white/90">{info.label ?? info.root}</span>
            {info.label && <span className="num shrink-0 text-[11px] text-white/30">{info.root}</span>}
            <button
              type="button"
              aria-label="드라이브 이름 바꾸기"
              onClick={() => {
                setDraft(info.label ?? "");
                setError(null);
                setEditing(true);
              }}
              className="shrink-0 rounded p-1 text-white/35 transition-colors hover:bg-white/10 hover:text-white"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-3.5 w-3.5">
                <path d="M4 20h4L19 9a2.1 2.1 0 0 0-4-4L4 16v4Z" strokeLinejoin="round" />
              </svg>
            </button>
          </>
        )}
      </div>
      {error && <p className="mt-1 text-[11px] text-red-400">{error}</p>}
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-white/60" style={{ width: `${ratio * 100}%` }} />
      </div>
      <div className="num mt-1.5 text-[11px] text-white/40">
        남은 공간 <Bytes bytes={info.freeBytes} /> / 전체 <Bytes bytes={info.totalBytes} />
      </div>
    </div>
  );
}

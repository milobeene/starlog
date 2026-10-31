"use client";

import { bytesParts } from "@/lib/format";

/** 이 게임에 도는 넣기 — 전역 알림과 같은 숫자를 자리에서도 보여준다 */
export function IngestProgress({ done, total, bytesDone, bytesTotal, compact = false }: { done: number; total: number; bytesDone: number; bytesTotal: number; compact?: boolean }) {
  const size = (n: number) => {
    const { value, unit } = bytesParts(n);
    return `${value}${unit}`;
  };
  const ratio = bytesTotal > 0 ? bytesDone / bytesTotal : total > 0 ? done / total : 0;
  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-2">
      {compact ? (
        // 사진 한 칸 크기 안에서는 두 줄로 — 한 줄이면 칸 밖으로 넘친다
        <p className="num text-[11px] leading-snug text-white/70">
          넣는 중 {done}/{total}
          <br />
          <span className="text-white/45">{size(bytesDone)}/{size(bytesTotal)}</span>
        </p>
      ) : (
        <p className="num text-sm text-white/70">
          넣는 중 {done}/{total} · {size(bytesDone)}/{size(bytesTotal)}
        </p>
      )}
      <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-white/70 transition-all duration-300" style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </div>
    </div>
  );
}

/** 올리다 실패한 파일들 — 이유와 함께 */
export function UploadFailures({ failed, onClose }: { failed: { name: string; reason: string }[]; onClose: () => void }) {
  if (failed.length === 0) return null;
  return (
    <div role="alert" className="mb-3 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2.5 text-xs">
      <div className="flex items-center justify-between gap-3">
        <span className="text-red-300">{failed.length}개를 올리지 못했습니다</span>
        <button type="button" onClick={onClose} aria-label="닫기" className="text-base leading-none text-white/35 transition-colors hover:text-white">
          ×
        </button>
      </div>
      <ul className="mt-1.5 flex flex-col gap-1">
        {failed.map((f, i) => (
          <li key={`${f.name}-${i}`} className="flex gap-2">
            <span className="max-w-[40%] shrink-0 truncate text-white/70">{f.name}</span>
            <span className="min-w-0 flex-1 text-white/40">{f.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

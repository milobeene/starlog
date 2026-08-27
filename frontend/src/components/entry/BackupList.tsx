"use client";

import { useCallback, useEffect, useState } from "react";
import EntryPanel from "./EntryPanel";
import { Button } from "@/components/ui/Field";
import { getBridge, type BackupUsage } from "@/lib/desktop";

/**
 * 세이브파일 하나의 백업 (v1.0 9단계, architecture §5).
 *
 * ## 되돌리기가 원본을 안 덮는다
 *
 * 고른 백업이 **새 세이브파일**이 된다. "되돌렸는데 그게 잘못이었다"는 실제로 일어나는데,
 * 덮어쓰면 그 순간 돌아갈 곳이 사라진다. 파일이 100KB 남짓이라 하나 더 만드는 값이 싸다.
 *
 * ## 한도를 지금 값과 나란히 보여준다
 *
 * 백업은 앱을 열 때마다 자동으로 쌓이고 넘치면 오래된 것부터 지워진다.
 * 그 규칙이 안 보이면 **"내 백업이 왜 없어졌지"**가 된다
 */
export default function BackupList({
  saveName,
  onBack,
  onRestored,
}: {
  saveName: string;
  onBack: () => void;
  onRestored: (newSaveName: string) => void;
}) {
  const [usage, setUsage] = useState<BackupUsage | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    getBridge()?.backups.usage(saveName).then(setUsage);
  }, [saveName]);

  useEffect(() => {
    reload();
  }, [reload]);

  const run = async (label: string, task: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const message = await task();
      if (message) setNotice(message);
      reload();
    } catch (e) {
      setError(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <EntryPanel
      title={`${saveName} 백업`}
      subtitle="앱을 열 때마다 자동으로 만들어집니다. 내용이 그대로면 만들지 않습니다."
      onBack={onBack}
    >
      <div className="flex flex-col gap-2">
        {usage === null && <div className="h-16 animate-pulse rounded-lg bg-white/5" />}

        {usage?.items.map((item) => (
          <div
            key={item.fileName}
            className="group flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3"
          >
            <span className="min-w-0 flex-1">
              <span className="num block truncate text-sm text-white/90">
                {readable(item.label)}
              </span>
              <span className="num mt-0.5 block text-[11px] text-white/35">
                {formatBytes(item.sizeBytes)}
              </span>
            </span>
            <button
              onClick={() =>
                run("되돌리기", async () => {
                  const created = await getBridge()!.backups.restore(saveName, item.fileName);
                  onRestored(created);
                  return null;
                })
              }
              disabled={busy}
              className="shrink-0 text-[11px] text-white/40 transition-colors hover:text-white"
            >
              되돌리기
            </button>
            <button
              onClick={() =>
                run("삭제", async () => {
                  await getBridge()!.backups.remove(saveName, item.fileName);
                  return null;
                })
              }
              disabled={busy}
              className="shrink-0 text-[11px] text-white/0 transition-colors group-hover:text-white/30 hover:!text-red-400"
            >
              삭제
            </button>
          </div>
        ))}

        {usage?.items.length === 0 && (
          <p className="py-2 text-xs text-white/35">아직 백업이 없습니다.</p>
        )}

        <div className="mt-3 flex items-center gap-3">
          <Button
            onClick={() =>
              run("백업", async () => {
                const made = await getBridge()!.backups.create(saveName);
                return made.removed.length > 0
                  ? `백업했습니다. 한도를 넘어 오래된 ${made.removed.length}개를 정리했습니다.`
                  : "백업했습니다.";
              })
            }
            disabled={busy}
          >
            {busy ? "처리 중" : "지금 백업"}
          </Button>

          {/*
            한도는 지금 쓰는 값과 **나란히** 있어야 한다.
            숫자만 있으면 "왜 지워졌지"가 생기고, 한도만 있으면 얼마나 여유가 있는지 모른다
          */}
          {usage && (
            <span className="num text-[11px] text-white/30">
              {usage.count} / {usage.keepCount}개 · {formatBytes(usage.totalBytes)} /{" "}
              {formatBytes(usage.keepBytes)}
            </span>
          )}
        </div>

        {usage && (
          <p className="text-[11px] leading-relaxed text-white/25">
            한도를 넘으면 오래된 것부터 지워집니다. 가장 최근 하나는 지워지지 않습니다.
          </p>
        )}

        {notice && <p className="text-xs text-emerald-300/80">{notice}</p>}
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </EntryPanel>
  );
}

/** `2026-08-28_013045` → `2026.08.28 01:30` */
function readable(label: string) {
  const m = label.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})/);
  return m ? `${m[1]}.${m[2]}.${m[3]} ${m[4]}:${m[5]}` : label;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

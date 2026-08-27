"use client";

import { useEffect, useState } from "react";
import EntryPanel from "./EntryPanel";
import { Button, FIELD_INPUT } from "@/components/ui/Field";
import { getBridge, type SaveFile } from "@/lib/desktop";

/**
 * 로컬 모드 — 세이브파일 고르기 (architecture §5).
 *
 * **세이브파일은 백업 JSON이 아니라 H2 DB 파일 그 자체다.** 고르면 그게 곧 현재 DB고,
 * 저장 버튼이 없다. 게임 세이브파일과 같은 은유라서 "내보내기(백업)"가
 * 별개 개념으로 깨끗하게 갈린다
 */
export default function SaveList({
  onBack,
  onLaunch,
  onBackups,
}: {
  onBack: () => void;
  onLaunch: (name: string) => void;
  onBackups: (name: string) => void;
}) {
  const [saves, setSaves] = useState<SaveFile[] | null>(null);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reload = () => getBridge()?.saves.list().then(setSaves);
  useEffect(() => { reload(); }, []);

  const create = async () => {
    setError(null);
    try {
      const clean = await getBridge()!.saves.create(newName);
      onLaunch(clean);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const remove = async (name: string) => {
    // 백업 폴더도 함께 사라진다 — 일렉트론이 처리한다. 남겨두면 주인 없는 폴더가 쌓인다
    await getBridge()!.saves.remove(name);
    reload();
  };

  return (
    <EntryPanel
      title="로컬 모드"
      subtitle="세이브파일을 고르면 그게 곧 지금의 기록입니다."
      onBack={onBack}
    >
      <div className="flex flex-col gap-2">
        {saves === null && <div className="h-16 animate-pulse rounded-lg bg-white/5" />}

        {saves?.map((save) => (
          <div
            key={save.name}
            className="group flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 transition-colors hover:border-white/25 hover:bg-white/[0.06]"
          >
            <button onClick={() => onLaunch(save.name)} className="min-w-0 flex-1 text-left">
              <div className="truncate text-sm text-white/90">{save.name}</div>
              <div className="num mt-0.5 text-[11px] text-white/35">
                {formatSize(save.sizeBytes)} · {formatDate(save.modifiedAt)}
              </div>
            </button>
            {/* 백업은 여기 있어야 한다 — DB가 닫혀 있어야 파일을 안전하게 복사한다 */}
            <button
              onClick={() => onBackups(save.name)}
              className="shrink-0 text-[11px] text-white/0 transition-colors group-hover:text-white/40 hover:!text-white"
            >
              백업
            </button>
            <button
              onClick={() => remove(save.name)}
              aria-label={`${save.name} 삭제`}
              /* 지우기는 눈에 안 띄어야 한다 — 고르러 온 화면에서 삭제가 먼저 보이면 안 된다 */
              className="shrink-0 text-[11px] text-white/0 transition-colors group-hover:text-white/30 hover:!text-red-400"
            >
              삭제
            </button>
          </div>
        ))}

        {saves?.length === 0 && (
          <p className="py-2 text-xs text-white/35">
            아직 세이브파일이 없습니다. 아래에 이름을 적어 새로 시작하세요.
          </p>
        )}

        <div className="mt-3 flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && newName.trim() && create()}
            placeholder="새 세이브파일 이름"
            className={FIELD_INPUT}
          />
          <Button variant="primary" onClick={create} disabled={!newName.trim()}>
            만들기
          </Button>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </EntryPanel>
  );
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

"use client";

import { useEffect, useState } from "react";
import EntryPanel from "./EntryPanel";
import { Button, FIELD_INPUT } from "@/components/ui/Field";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
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
  /* 되돌릴 수 없다 — 예전엔 안내도 없이 백업까지 통째로 사라졌다 */
  const [deleting, setDeleting] = useState<SaveFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** 이름을 고치는 중인 세이브. null이면 아무것도 안 고치는 중 */
  const [renaming, setRenaming] = useState<{ from: string; to: string } | null>(null);

  /*
   * ⚠️ **`.catch`가 없으면 스켈레톤이 영영 안 걷힌다** (2026-08-28). 실제로 그랬다 —
   * 목록이 거부되면 `saves`가 null로 남아 "불러오는 중" 상자만 계속 떠 있었고,
   * 화면에는 실패했다는 흔적이 어디에도 없었다
   */
  const reload = () =>
    getBridge()
      ?.saves.list()
      .then(setSaves)
      .catch((e) => {
        setSaves([]);
        setError(e instanceof Error ? e.message : String(e));
      });
  useEffect(() => { reload(); }, []);

  const rename = async () => {
    if (!renaming) return;
    setError(null);
    try {
      await getBridge()!.saves.rename(renaming.from, renaming.to.trim());
      setRenaming(null);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const create = async () => {
    setError(null);
    try {
      const clean = await getBridge()!.saves.create(newName);
      onLaunch(clean);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };



  return (
    <EntryPanel
      title="로컬 세이브파일"
      subtitle="세이브파일을 고르면 그게 곧 지금의 기록입니다."
      onBack={onBack}
    >
      <div className="flex flex-col gap-2">
        {saves === null && <div className="h-16 skeleton-sweep rounded-lg bg-white/[0.06]" />}

        {/* 목록만 자기 안에서 스크롤한다 — 입구 전체가 밀려 올라가면 안 된다 */}
        {saves !== null && saves.length > 0 && (
          <div className="entry-list flex flex-col gap-2">
            {saves.map((save) => (
              <div
                key={save.name}
                className="group flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 transition-colors hover:border-white/25 hover:bg-white/[0.06]"
              >
                {renaming?.from === save.name ? (
                  /* 고치는 중에는 그 줄이 통째로 입력칸이 된다 — 별도 모달을 띄울 만한 일이 아니다 */
                  <>
                    <input
                      autoFocus
                      value={renaming.to}
                      onChange={(e) => setRenaming({ ...renaming, to: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") rename();
                        if (e.key === "Escape") setRenaming(null);
                      }}
                      className={`${FIELD_INPUT} min-w-0 flex-1`}
                    />
                    <button
                      onClick={rename}
                      disabled={!renaming.to.trim() || renaming.to === save.name}
                      className="shrink-0 text-[11px] text-white/70 transition-colors hover:text-white disabled:text-white/20"
                    >
                      저장
                    </button>
                    <button
                      onClick={() => setRenaming(null)}
                      className="shrink-0 text-[11px] text-white/30 transition-colors hover:text-white"
                    >
                      취소
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => onLaunch(save.name)} className="min-w-0 flex-1 text-left">
                      <div className="truncate text-sm text-white/90">{save.name}</div>
                      <div className="num mt-0.5 text-[11px] text-white/35">
                        {formatSize(save.sizeBytes)} · {formatDate(save.modifiedAt)}
                      </div>
                    </button>
                    {/*
                      이름 바꾸기 — 되돌리기가 `내 기록 2026-08-28_041513` 같은 이름을 만들고,
                      탐색기에서 손으로 바꾸면 규칙을 어겨 **열 수 없는 파일**이 된다.
                      앱 안에 길이 있어야 그 사고가 안 난다. 백업 폴더도 함께 따라간다
                    */}
                    <button
                      onClick={() => setRenaming({ from: save.name, to: save.name })}
                      className="shrink-0 text-[11px] text-white/0 transition-colors group-hover:text-white/40 hover:!text-white"
                    >
                      이름
                    </button>
                    {/* 백업은 여기 있어야 한다 — DB가 닫혀 있어야 파일을 안전하게 복사한다 */}
                    <button
                      onClick={() => onBackups(save.name)}
                      className="shrink-0 text-[11px] text-white/0 transition-colors group-hover:text-white/40 hover:!text-white"
                    >
                      백업
                    </button>
                    <button
                      onClick={() => setDeleting(save)}
                      aria-label={`${save.name} 삭제`}
                      /* 지우기는 눈에 안 띄어야 한다 — 고르러 온 화면에서 삭제가 먼저 보이면 안 된다 */
                      className="shrink-0 text-[11px] text-white/0 transition-colors group-hover:text-white/30 hover:!text-red-400"
                    >
                      삭제
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

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

      {deleting && (
        <ConfirmDialog
          title="세이브파일 삭제"
          confirmLabel="삭제"
          message={
            <>
              <b className="text-white">{deleting.name}</b>을(를) 완전히 지웁니다. 이 기록의
              게임·회차·메모가 전부 사라지며 되돌릴 수 없습니다.
              {/*
                ⚠️ 백업까지 사라진다는 걸 반드시 말해야 한다 — "백업이 있으니 괜찮겠지"가
                이 화면에서 가장 자연스러운 오해다
              */}
              <span className="mt-2 block text-amber-200/70">
                이 세이브파일의 백업도 함께 지워집니다.
              </span>
            </>
          }
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await getBridge()!.saves.remove(deleting.name);
            setDeleting(null);
            reload();
          }}
        />
      )}
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

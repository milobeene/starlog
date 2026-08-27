"use client";

import { useEffect, useState } from "react";
import EntryPanel from "./EntryPanel";
import ConnectionForm from "./ConnectionForm";
import { Button } from "@/components/ui/Field";
import { getBridge, type ConnectionProfile } from "@/lib/desktop";

/**
 * 클라우드 모드 — 연결 고르기.
 *
 * 목록과 폼을 한 패널 안에서 갈아끼운다. 라우팅으로 나누면 뒤로가기가 브라우저 히스토리에
 * 걸리는데, **여기는 백엔드가 뜨기 전이라 라우터가 있어도 갈 데가 없다**
 */
export default function ConnectionList({
  onBack,
  onLaunch,
}: {
  onBack: () => void;
  onLaunch: (name: string) => void;
}) {
  const [profiles, setProfiles] = useState<ConnectionProfile[] | null>(null);
  const [editing, setEditing] = useState<ConnectionProfile | null>(null);
  const [adding, setAdding] = useState(false);

  const reload = () => getBridge()?.connections.list().then(setProfiles);
  useEffect(() => { reload(); }, []);

  const closeForm = () => {
    setEditing(null);
    setAdding(false);
    reload();
  };

  if (adding || editing) {
    return (
      <EntryPanel
        title={editing ? "연결 수정" : "새 연결"}
        subtitle="데이터베이스만 채우면 시작할 수 있습니다."
        onBack={closeForm}
      >
        <ConnectionForm initial={editing ?? undefined} onCancel={closeForm} onSaved={closeForm} />
      </EntryPanel>
    );
  }

  return (
    <EntryPanel
      title="클라우드 모드"
      subtitle="내가 준비한 데이터베이스에 연결합니다."
      onBack={onBack}
    >
      <div className="flex flex-col gap-2">
        {profiles === null && <div className="h-16 animate-pulse rounded-lg bg-white/5" />}

        {profiles?.map((profile) => (
          <div
            key={profile.name}
            className="group flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 transition-colors hover:border-white/25 hover:bg-white/[0.06]"
          >
            <button onClick={() => onLaunch(profile.name)} className="min-w-0 flex-1 text-left">
              <div className="truncate text-sm text-white/90">{profile.name}</div>
              {/* 비번은 안 보여준다 — 목록에서 확인할 값이 아니다. 수정 화면에 눈 버튼이 있다 */}
              <div className="mt-0.5 truncate text-[11px] text-white/35">{hostOf(profile.db.url)}</div>
            </button>
            <button
              onClick={() => setEditing(profile)}
              className="shrink-0 text-[11px] text-white/0 transition-colors group-hover:text-white/40 hover:!text-white"
            >
              수정
            </button>
            <button
              onClick={async () => {
                await getBridge()!.connections.remove(profile.name);
                reload();
              }}
              className="shrink-0 text-[11px] text-white/0 transition-colors group-hover:text-white/30 hover:!text-red-400"
            >
              삭제
            </button>
          </div>
        ))}

        {profiles?.length === 0 && (
          <p className="py-2 text-xs text-white/35">
            저장된 연결이 없습니다. 새 연결을 만들어 주세요.
          </p>
        )}

        <div className="mt-3">
          <Button variant="primary" onClick={() => setAdding(true)}>
            새 연결
          </Button>
        </div>
      </div>
    </EntryPanel>
  );
}

/** `jdbc:postgresql://호스트/DB?...` 에서 사람이 알아볼 부분만 */
function hostOf(url: string) {
  const found = url.match(/\/\/([^/?]+)\/?([^?]*)/);
  if (!found) return url;
  return found[2] ? `${found[1]} / ${found[2]}` : found[1];
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { Button, FIELD_INPUT, FIELD_SELECT } from "@/components/ui/Field";
import { bridgeMessage, getBridge, type ExternalSource, type SourceKind } from "@/lib/desktop";

const KIND_LABEL: Record<SourceKind, string> = { steam: "Steam", folder: "일반 폴더" };
const NAME_MAX = 40;

/**
 * 외부 스크린샷 폴더 등록 (2.2) — 스팀·ShareX·다른 런처의 폴더를 이 PC에 등록해 두고 인박스에서 본다.
 *
 * 폴더는 **네이티브 폴더 창으로만** 고른다. 경로를 손으로 적는 칸이 없다 — 화면이 경로를 정하지 못하게 한 설계다.
 * 등록은 이 PC의 `settings.json`에 남고 DB에는 안 들어간다 (세이브를 옮겨도 PC마다 폴더가 다르다).
 * 일렉트론에서만 뜻이 있다
 */
export default function SourceFolders() {
  const sources = getBridge()?.sources;
  const [list, setList] = useState<ExternalSource[] | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<SourceKind>("steam");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: string; draft: string } | null>(null);
  const [removing, setRemoving] = useState<ExternalSource | null>(null);

  const load = useCallback(() => {
    getBridge()?.sources?.list().then(setList).catch(() => setList([]));
  }, []);
  useEffect(load, [load]);

  if (!sources) return null;

  const add = async () => {
    const label = name.trim() || KIND_LABEL[kind];
    setBusy(true);
    setError(null);
    try {
      const r = await sources.add({ kind, name: label });
      if (!r.canceled) setName("");
      load();
    } catch (caught) {
      setError(bridgeMessage(caught, "폴더를 등록하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  };

  const saveName = async () => {
    if (!editing) return;
    try {
      await sources.rename(editing.id, editing.draft);
      setEditing(null);
      setError(null);
      load();
    } catch (caught) {
      setError(bridgeMessage(caught, "이름을 바꾸지 못했습니다."));
    }
  };

  return (
    <section className="flex flex-col border-t border-white/8 pt-6" data-source-folders>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[11px] font-semibold tracking-widest text-white/50 uppercase">외부 스크린샷 폴더</h3>
        <Link href="/screenshots" className="text-xs text-white/50 transition-colors hover:text-white">
          스크린샷 화면 열기 →
        </Link>
      </div>
      <p className="mt-2 text-[11px] text-white/35">
        스팀이나 ShareX가 사진을 쌓는 폴더를 등록하면 스크린샷 화면에서 보고, 고른 사진을 게임으로 가져올 수 있습니다.
        스팀 폴더는 복사만 하고, 그 밖의 폴더는 옮기면 원본이 휴지통으로 갑니다. 등록은 이 PC에만 남습니다.
      </p>

      <ul className="mt-3 flex flex-col gap-2">
        {(list ?? []).map((s) => (
          <li key={s.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5">
            <span className="shrink-0 rounded border border-white/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-widest text-white/50 uppercase">
              {KIND_LABEL[s.kind]}
            </span>
            <div className="min-w-0 flex-1">
              {editing?.id === s.id ? (
                <input
                  autoFocus
                  value={editing.draft}
                  maxLength={NAME_MAX}
                  onChange={(e) => setEditing({ id: s.id, draft: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveName();
                    if (e.key === "Escape") setEditing(null);
                  }}
                  className={`${FIELD_INPUT} max-w-xs !py-1`}
                />
              ) : (
                <div className="truncate text-sm text-white/90">{s.name}</div>
              )}
              <div className="num truncate text-[11px] text-white/30" title={s.path}>
                {s.ok ? s.path : `${s.path} — ${s.reason}`}
              </div>
            </div>
            {editing?.id === s.id ? (
              <>
                <button type="button" onClick={() => void saveName()} className="text-xs text-white/70 hover:text-white">저장</button>
                <button type="button" onClick={() => setEditing(null)} className="text-xs text-white/35 hover:text-white">취소</button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setEditing({ id: s.id, draft: s.name })}
                  className="shrink-0 text-xs text-white/40 transition-colors hover:text-white"
                >
                  이름 바꾸기
                </button>
                <button
                  type="button"
                  onClick={() => setRemoving(s)}
                  className="shrink-0 text-xs text-white/40 transition-colors hover:text-red-400"
                >
                  해제
                </button>
              </>
            )}
          </li>
        ))}
        {list?.length === 0 && <li className="text-xs text-white/30">등록한 폴더가 없습니다.</li>}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2" data-source-add>
        <select aria-label="종류" value={kind} onChange={(e) => setKind(e.target.value as SourceKind)} className={`${FIELD_SELECT} !w-36 shrink-0`}>
          <option value="steam">Steam</option>
          <option value="folder">일반 폴더</option>
        </select>
        <input
          aria-label="이름"
          value={name}
          maxLength={NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          placeholder={`이름 (비우면 ${KIND_LABEL[kind]})`}
          className={`${FIELD_INPUT} !w-auto min-w-40 max-w-xs flex-1`}
        />
        <Button disabled={busy} onClick={() => void add()}>폴더 고르기</Button>
      </div>
      <p className="mt-1.5 text-[11px] text-white/30">
        {kind === "steam"
          ? "스팀 설치 폴더, userdata 폴더, 또는 760/remote 폴더 중 아무거나 고르면 됩니다."
          : "하위 폴더(4단계까지)까지 읽고, 폴더별로 묶어 보여줍니다."}
      </p>
      {error && <p className="mt-1 text-[11px] text-red-400">{error}</p>}

      {removing && (
        <ConfirmDialog
          title="폴더 등록 해제"
          message={`'${removing.name}' 등록을 해제합니다. 폴더의 파일은 그대로 두고, 이 앱이 만든 썸네일 캐시만 지웁니다.`}
          confirmLabel="해제"
          onConfirm={async () => {
            await sources.remove(removing.id);
            load();
          }}
          onClose={() => setRemoving(null)}
        />
      )}
    </section>
  );
}

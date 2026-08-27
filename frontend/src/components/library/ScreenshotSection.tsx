"use client";

import { useState } from "react";
import DropZone from "@/components/media/DropZone";
import SectionIcon from "@/components/ui/SectionIcon";
import { Button } from "@/components/ui/Field";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { uploadScreenshot } from "@/lib/upload";
import { getBridge } from "@/lib/desktop";

/**
 * 게임별 스크린샷 (v1.0 7단계, architecture §10-1).
 *
 * ## 보기와 삭제만 준다
 *
 * 캡션도 순서도 없다 (결정 41) — 주는 순간 편집 UI가 딸려오고, 그건 이 앱이 하려는 일이 아니다.
 * 그래서 **DB에 행이 없고 폴더가 곧 목록이다.** 사람이 탐색기에서 파일을 지워도
 * 다음 조회에 그대로 반영된다.
 *
 * ## 붙여넣기가 핵심이다
 *
 * 스크린샷은 찍으면 클립보드에 있다. 저장하고 → 폴더를 찾고 → 끌어오는 세 단계가
 * ⌘V 하나로 없어진다. `DropZone`이 문서 전체에서 붙여넣기를 듣는 이유가 이것
 */
type Shot = { fileName: string; url: string; sizeBytes: number };

export default function ScreenshotSection({ entryId }: { entryId: number }) {
  /* 조회는 화면 전체가 쓰는 훅에 맡긴다 — 로딩·에러·재조회가 이미 한 벌로 들어 있다 */
  const list = useApi<Shot[]>(`/api/backlog/${entryId}/screenshots`);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [zoomed, setZoomed] = useState<Shot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shots = list.data;

  const add = async (files: File[]) => {
    setBusy(true);
    setError(null);
    try {
      // 한 장씩 순서대로 — 동시에 보내면 서버가 붙이는 번호가 겹친다
      for (const file of files) {
        await uploadScreenshot(entryId, file);
      }
      list.reload();
    } catch (caught) {
      setError(errorMessage(caught, "올리지 못했습니다."));
    } finally {
      setBusy(false);
    }
  };

  const removeSelected = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      await api.post(`/api/backlog/${entryId}/screenshots/delete`, [...selected]);
      setSelected(new Set());
      list.reload();
    } catch (caught) {
      setError(errorMessage(caught, "삭제하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (name: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const openFolder = async () => {
    const { path } = await api.get<{ path: string }>(
      `/api/backlog/${entryId}/screenshots/folder`,
    );
    getBridge()?.openPath(path);
  };

  return (
    <section>
      <h3 className="mb-4 flex items-center justify-between gap-3 text-base font-medium text-white/90 sm:text-lg">
        <span className="flex items-center gap-2">
          <SectionIcon name="note" />
          Screenshots
        </span>
        <span className="flex gap-2">
          {selected.size > 0 && (
            <Button variant="danger" onClick={removeSelected} disabled={busy}>
              {selected.size}장 삭제
            </Button>
          )}
          {/* 탐색기 열기는 일렉트론에서만 뜻이 있다 — 브라우저는 로컬 경로를 못 연다 */}
          {getBridge() && <Button onClick={openFolder}>폴더 열기</Button>}
        </span>
      </h3>

      {(error || list.error) && (
        <p className="mb-3 text-xs text-red-400">
          {error ?? "스크린샷을 불러오지 못했습니다."}
        </p>
      )}

      {shots && shots.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {shots.map((shot) => {
            const picked = selected.has(shot.fileName);
            return (
              <div
                key={shot.fileName}
                className={`group relative aspect-video overflow-hidden rounded-lg border transition-colors ${
                  picked ? "border-white/70" : "border-white/10 hover:border-white/30"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={shot.url}
                  alt={shot.fileName}
                  onClick={() => setZoomed(shot)}
                  className="h-full w-full cursor-zoom-in object-cover"
                />
                {/*
                  체크는 늘 보이지 않는다 — 넉 장만 있어도 화면이 체크박스로 뒤덮인다.
                  고른 것은 계속 보이고, 나머지는 마우스를 올렸을 때만
                */}
                <button
                  onClick={() => toggle(shot.fileName)}
                  aria-label={`${shot.fileName} 선택`}
                  className={`absolute top-2 left-2 flex h-5 w-5 items-center justify-center rounded border text-[10px] transition-opacity ${
                    picked
                      ? "border-white bg-white text-black opacity-100"
                      : "border-white/60 bg-black/40 text-transparent opacity-0 group-hover:opacity-100"
                  }`}
                >
                  ✓
                </button>
              </div>
            );
          })}
        </div>
      )}

      <DropZone
        onFiles={add}
        multiple
        disabled={busy}
        hint="스크린샷은 찍으면 클립보드에 있습니다 — ⌘V로 바로 붙여넣으세요"
      >
        {busy ? <p className="text-sm text-white/60">올리는 중…</p> : undefined}
      </DropZone>

      {/* 확대 — 모달 컴포넌트를 안 쓴다. 그림만 크게 보면 되고 제목·버튼이 방해가 된다 */}
      {zoomed && (
        <div
          onClick={() => setZoomed(null)}
          className="fixed inset-0 z-[110] flex cursor-zoom-out items-center justify-center bg-black/85 p-6"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={zoomed.url}
            alt={zoomed.fileName}
            className="max-h-full max-w-full rounded-lg object-contain"
          />
        </div>
      )}
    </section>
  );
}

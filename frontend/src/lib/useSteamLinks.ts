"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { getBridge } from "@/lib/desktop";
import type { SteamLink } from "@/lib/types";

/**
 * 스팀 묶음(appid) ↔ STARLOG 게임 연결 (서버 `steam_app_link`).
 *
 * - 열린 스팀 폴더의 appid들을 한 번에 `POST /api/steam-links/resolve` — 서버가 IGDB로 자동 연결(AUTO)하고, 직접 고른 것(MANUAL)은 늘 이긴다
 * - 서버가 안 되면 **옛 기억(`steamGameMap`)** 으로만 보여준다 — 연결 표가 없는 서버·네트워크 실패에도 화면이 멈추지 않게
 * - 처음 한 번, 옛 기억을 MANUAL로 서버에 옮기고 메인에 "옮겼다"고 알린다 (이후 옛 기억은 안 읽는다)
 */
export function useSteamLinks(appids: string[], enabled: boolean) {
  const [links, setLinks] = useState<Record<string, SteamLink>>({});
  const [failed, setFailed] = useState(false);
  const key = useMemo(() => [...appids].sort().join(","), [appids]);
  const migrated = useRef(false);

  useEffect(() => {
    if (!enabled || key === "") return;
    let alive = true;
    (async () => {
      const sources = getBridge()?.sources;
      // 1) 옛 기억 → 서버 (한 번)
      if (!migrated.current && sources) {
        migrated.current = true;
        try {
          const old = await sources.memory();
          const rows = Object.entries(old);
          if (rows.length > 0) {
            for (const [appid, entryId] of rows) {
              try { await api.put(`/api/steam-links/${appid}`, { entryId }); } catch (caught) {
                // 지워진 게임(404)은 건너뛴다 — 서버가 아예 안 되는 것(그 밖)만 중단해 다음에 다시
                if ((caught as { status?: number }).status !== 404) throw caught;
              }
            }
          }
          await sources.memoryMigrated?.();
        } catch { /* 서버가 안 되면 다음 방문에 다시 — 옛 기억은 그대로 남는다 */ }
      }
      // 2) 연결 읽기
      try {
        const ids = key.split(",").slice(0, 200);
        const res = await api.post<{ links: SteamLink[] }>("/api/steam-links/resolve", { appids: ids });
        if (!alive) return;
        setLinks((cur) => ({ ...cur, ...Object.fromEntries(res.links.map((l) => [l.appid, l])) }));
        setFailed(false);
      } catch {
        if (!alive) return;
        setFailed(true);
        // 폴백: 서버 없이도 옛 기억이 남아 있으면 그것으로 (연결 이름은 모른다)
        const old = await sources?.memory().catch(() => ({} as Record<string, number>));
        if (!alive || !old) return;
        setLinks((cur) => ({
          ...Object.fromEntries(Object.entries(old).map(([appid, entryId]) => [appid, { appid, entryId, entryName: null, source: "MANUAL" as const }])),
          ...cur,
        }));
      }
    })();
    return () => { alive = false; };
  }, [key, enabled]);

  /** 사용자가 고른 게임으로 직접 연결 (MANUAL) */
  const setManual = useCallback(async (appid: string, entryId: number, entryName: string | null) => {
    setLinks((cur) => ({ ...cur, [appid]: { appid, entryId, entryName, source: "MANUAL" } }));
    try { await api.put(`/api/steam-links/${appid}`, { entryId }); } catch { /* 연결 표 저장은 못 해도 이번 옮기기는 된다 */ }
  }, []);

  return { links, failed, setManual };
}

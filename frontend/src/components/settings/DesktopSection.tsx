"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Field";
import { getBridge } from "@/lib/desktop";

/**
 * 데스크탑 앱에서만 보이는 칸 (v1.0 5단계).
 *
 * **브라우저에서는 스스로 아무것도 안 그린다.** 조건부 렌더를 부모에 두면 설정 화면이
 * "지금 데스크탑인가"를 알아야 하고, 그 지식이 화면마다 번진다.
 *
 * ## 여기 있는 것과 입구에 있는 것
 *
 * 기준은 **"재시작이 필요한가"**다 (architecture §2). 데이터 루트를 바꾸는 건
 * DB 파일 위치가 바뀌는 일이라 **입구**에 있고, 여기는 재시작이 필요 없는 것만 둔다
 */
export default function DesktopSection() {
  const [dirs, setDirs] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    getBridge()?.settings.get().then((s) => setDirs(s.dirs));
  }, []);

  if (!getBridge()) return null;

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-medium tracking-wide text-white/80">앱</h2>
        <p className="mt-1 text-xs text-white/40">
          기록이 저장되는 폴더와 앱 시작 지점입니다.
        </p>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
        <div className="text-[10px] font-semibold tracking-widest text-white/40 uppercase">
          데이터 폴더
        </div>
        <div className="mt-1 font-mono text-[11px] break-all text-white/60">{dirs?.root ?? "…"}</div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => getBridge()!.openFolder("root")}>폴더 열기</Button>
        <Button onClick={() => getBridge()!.openFolder("saves")}>세이브파일</Button>
        <Button onClick={() => getBridge()!.openFolder("backups")}>백업</Button>
        {/*
          모드 전환 = 백엔드를 죽이고 입구로 돌아가기다 (결정 61).
          살아있는 JPA를 갈아끼우지 않고 **다시 띄운다** — 그게 §2의 전부다
        */}
        <Button variant="danger" onClick={() => getBridge()!.backToEntry()}>
          입구로 돌아가기
        </Button>
      </div>
    </section>
  );
}

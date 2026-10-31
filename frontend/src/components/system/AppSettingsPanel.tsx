"use client";

import SourceFolders from "@/components/system/SourceFolders";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Field";
import { getBridge } from "@/lib/desktop";
import DesktopSection from "@/components/settings/DesktopSection";

/**
 * 앱 설정 탭 (2026-08-28 재구성).
 *
 * IGDB는 여기서 뺐다 — 연결 설정에도 같은 칸이 있어 **두 군데가 됐기 때문**이다.
 * 대신 프로필에 있던 "데이터 옮기기"를 가져왔다: 세이브파일과 데이터베이스를 오가는 일은
 * 프로필(내 이름·배경색)보다 **앱 층위**에 가깝다
 */
export default function AppSettingsPanel() {
  return (
    <div className="flex flex-col gap-8">
      <DataFolder />
      <SourceFolders />
      <DesktopSection />
    </div>
  );
}

/**
 * 데이터 폴더 — **열기만 준다.**
 *
 * 경로를 바꾸는 건 DB 파일 위치가 바뀌는 일이라 입구에 있어야 한다(백엔드가 뜨기 전).
 * 여기서는 "지금 어디에 쌓이고 있나"를 보여주고 열어주기만 한다
 */
function DataFolder() {
  const [dirs, setDirs] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    getBridge()?.settings.get().then((s) => setDirs(s.dirs));
  }, []);

  if (!getBridge()) return null;

  return (
    <section className="flex flex-col gap-3 border-t border-white/8 pt-6">
      <div>
        <h3 className="text-[11px] font-semibold tracking-widest text-white/50 uppercase">
          데이터 폴더
        </h3>
        <p className="mt-1 font-mono text-[11px] break-all text-white/40">{dirs?.root ?? "…"}</p>
        <p className="mt-1.5 text-[11px] text-white/25">
          위치를 바꾸시려면 입구 화면에서 설정해 주세요. 데이터베이스 파일이 열려 있는 동안에는
          옮길 수 없습니다.
        </p>
      </div>
      <div>
        <Button onClick={() => getBridge()!.openFolder("root")}>폴더 열기</Button>
      </div>
    </section>
  );
}

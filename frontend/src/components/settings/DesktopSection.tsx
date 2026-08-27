"use client";

import { useEffect, useState } from "react";
import { Button, FIELD_INPUT } from "@/components/ui/Field";
import { getBridge, type SessionInfo } from "@/lib/desktop";

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
  const [session, setSession] = useState<SessionInfo | null>(null);

  useEffect(() => {
    getBridge()?.settings.get().then((s) => setDirs(s.dirs));
    getBridge()?.session.current().then(setSession);
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
        {/*
          **더 이상 위험한 동작이 아니다** (2026-08-28). 예전엔 여기서 백엔드를 죽였는데,
          이제 살려둔 채 창만 옮긴다 — [최근 접속]으로 즉시 돌아올 수 있다
        */}
        <Button onClick={() => getBridge()!.backToEntry()}>입구로</Button>
      </div>

      {/* 클라우드로 접속 중일 때만. 로컬 모드에는 이미 세이브파일이 그 자체로 있다 */}
      {session?.mode === "cloud" && <CloudExtract />}
    </section>
  );
}

/**
 * 클라우드 → 로컬 세이브파일 (architecture §6).
 *
 * **"백업"이 아니라 "생성"이다.** 뽑아낸 순간 그건 이미 열 수 있는 세이브파일이라
 * 복원이라는 절차가 아예 생기지 않는다 — 로컬 모드에서 고르면 그때부터 그게 현재 DB다
 */
function CloudExtract() {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const extract = async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const result = await getBridge()!.cloudToSaveFile(name.trim());
      setDone(result.saveName);
      setName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 flex flex-col gap-3 border-t border-white/8 pt-5">
      <div>
        <h3 className="text-[11px] font-semibold tracking-widest text-white/50 uppercase">
          로컬 세이브파일로 뽑기
        </h3>
        <p className="mt-1 text-[11px] leading-relaxed text-white/30">
          지금 연결된 데이터를 이 컴퓨터의 세이브파일로 만듭니다. 만든 뒤에는 인터넷 없이도
          로컬 모드로 열 수 있습니다.
          {/*
            미리 말해줘야 하는 것 — 뽑고 나서 커버가 없어진 걸 발견하면
            "데이터가 깨졌나" 하고 놀란다
          */}
          <br />
          <span className="text-amber-200/60">
            직접 올리신 커버는 함께 오지 않습니다(스토리지에 있습니다). IGDB 커버로 표시됩니다.
          </span>
        </p>
      </div>

      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="새 세이브파일 이름"
          className={FIELD_INPUT}
        />
        <Button variant="primary" onClick={extract} disabled={busy || !name.trim()}>
          {busy ? "뽑는 중" : "뽑기"}
        </Button>
      </div>

      {done && (
        <p className="text-xs text-emerald-300/80">
          <b>{done}</b> 세이브파일을 만들었습니다. 입구의 로컬 모드에서 열 수 있습니다.
        </p>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

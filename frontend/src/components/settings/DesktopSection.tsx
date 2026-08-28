"use client";

import { useEffect, useState } from "react";
import { Button, FIELD_INPUT } from "@/components/ui/Field";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { getBridge, type SaveFile, type SessionInfo } from "@/lib/desktop";
import { putTask, updateTask, useTaskRunning } from "@/lib/tasks";
import { api } from "@/lib/api";

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
  const [session, setSession] = useState<SessionInfo | null>(null);

  useEffect(() => {
    getBridge()?.session.current().then(setSession);
  }, []);

  if (!getBridge()) return null;

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-medium tracking-wide text-white/80">데이터 옮기기</h2>
        <p className="mt-1 text-xs text-white/40">
          세이브파일과 데이터베이스 사이에서 기록을 옮깁니다.
        </p>
      </div>

      {/* 클라우드로 접속 중일 때만. 로컬은 이미 세이브파일이 그 자체로 있다 */}
      {session?.mode === "cloud" ? (
        <>
          <CloudExtract />
          {/*
            반대 방향. 뽑기만 있고 올리기가 없어서 **밖에서 정리한 기록을 다시 올릴 수가
            없었다.** 되돌릴 수 없는 일이라 뽑기 아래에 두고 색을 달리한다
          */}
          <SaveFileUpload />
        </>
      ) : (
        <p className="text-[11px] leading-relaxed text-white/30">
          지금은 로컬 세이브파일로 쓰고 계십니다. 백업과 되돌리기는 입구 화면의 세이브파일
          목록에서 하실 수 있습니다.
        </p>
      )}
    </section>
  );
}

/**
 * 클라우드 → 로컬 세이브파일 (architecture §6).
 *
 * **"백업"이 아니라 "생성"이다.** 뽑아낸 순간 그건 이미 열 수 있는 세이브파일이라
 * 복원이라는 절차가 아예 생기지 않는다 — 로컬 모드에서 고르면 그때부터 그게 현재 DB다
 */
const EXTRACT_TASK = "save-extract";

function CloudExtract() {
  const [name, setName] = useState("");
  /* 스토리지를 실제로 쓰고 있나 — 안 쓰면 커버 경고가 겁만 주는 문구가 된다 */
  const [usesStorage, setUsesStorage] = useState(false);
  /*
   * ⚠️ **"도는 중"을 컴포넌트가 들면 안 된다** (2026-08-28). 뽑기는 수십 초가 걸리는데
   * 그동안 다른 화면에 갔다 오면 이 컴포넌트가 새로 마운트되어 `busy`가 false로 돌아간다 —
   * 화면은 멀쩡해 보이는데 뒤에서는 아직 돌고 있고, 한 번 더 누르면 같은 일이 두 번 돈다
   */
  const busy = useTaskRunning(EXTRACT_TASK);

  useEffect(() => {
    api.get<{ storage: { configured: boolean } }>("/api/system")
      .then((s) => setUsesStorage(s.storage.configured))
      .catch(() => setUsesStorage(false));
  }, []);

  const extract = async () => {
    const target = name.trim();
    putTask({
      id: EXTRACT_TASK,
      kind: "save-transfer",
      title: `${target} — 세이브파일로 뽑는 중`,
      // total이 0이면 진행률 바 없이 도는 표시만 — 몇 건인지 미리 알 수 없다
      progress: { done: 0, total: 0 },
    });
    setName("");
    try {
      const result = await getBridge()!.cloudToSaveFile(target);
      updateTask(EXTRACT_TASK, {
        progress: undefined,
        title: "로컬 세이브파일로 뽑기",
        result: {
          ok: true,
          message: `${result.saveName} 세이브파일을 만들었습니다. 입구의 [로컬 세이브파일]에서 열 수 있습니다.`,
        },
      });
    } catch (e) {
      updateTask(EXTRACT_TASK, {
        progress: undefined,
        title: "로컬 세이브파일로 뽑기",
        result: { ok: false, message: e instanceof Error ? e.message : String(e) },
      });
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
          로컬 세이브파일로 열 수 있습니다.
          {/*
            미리 말해줘야 하는 것 — 뽑고 나서 커버가 없어진 걸 발견하면
            "데이터가 깨졌나" 하고 놀란다.
            ⚠️ **스토리지를 쓸 때만 해당한다** — 안 쓰면 커버가 이미 데이터 폴더에 있어서
            그대로 따라온다. 조건 없이 띄우면 겁만 주는 문구가 된다
          */}
          {usesStorage && (
            <>
              <br />
              <span className="text-amber-200/60">
                직접 올리신 커버는 함께 오지 않습니다(스토리지에 있습니다). IGDB 커버로
                표시됩니다.
              </span>
            </>
          )}
        </p>
      </div>

      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="새 세이브파일 이름"
          /* 도는 동안 값을 못 바꾼다 — 지금 뽑고 있는 이름과 화면의 이름이 어긋나면 안 된다 */
          disabled={busy}
          className={FIELD_INPUT}
        />
        <Button variant="primary" onClick={extract} disabled={busy || !name.trim()}>
          {busy ? "뽑는 중" : "뽑기"}
        </Button>
      </div>

      {/* 결과는 알림으로 간다 — 다른 화면에 가 있어도 놓치지 않는다 */}
    </div>
  );
}

/**
 * 로컬 세이브파일 → 지금 붙은 데이터베이스. **덮어쓴다** (2026-08-28).
 *
 * ## 왜 덮어쓰기뿐인가
 *
 * 병합을 하려면 "같은 항목인가"를 판정해야 하는데, 같은 게임의 회차 두 벌이 같은 것인지
 * 다른 것인지 알 방법이 없다. 그 문제가 이 기능 전체보다 크다 (`MemberImportService` 주석).
 *
 * ## 지우기 전에 자동으로 뽑아둔다
 *
 * 일렉트론이 덮어쓰기 **직전에** 지금 데이터베이스를 세이브파일로 뽑는다. 클라우드에는
 * 백업이 없다는 게 9단계의 전제였고 이 기능이 정확히 그 구멍을 건드리기 때문이다.
 * 그 이름을 반드시 보여준다 — 있는 줄 몰라야 할 이유가 없다
 */
const UPLOAD_TASK = "save-overwrite";

function SaveFileUpload() {
  const [saves, setSaves] = useState<SaveFile[] | null>(null);
  const [picked, setPicked] = useState<string>("");
  const [confirming, setConfirming] = useState(false);
  /*
   * ⚠️ **덮어쓰기는 되돌릴 수 없다.** 다른 화면에 갔다 와서 `busy`가 풀린 채 한 번 더 누르면
   * 지우고 붓는 일이 겹친다. "도는 중"의 진실은 알림 스토어가 갖는다
   */
  const busy = useTaskRunning(UPLOAD_TASK);

  useEffect(() => {
    getBridge()?.saves.list().then(setSaves).catch(() => setSaves([]));
  }, []);

  const upload = async () => {
    setConfirming(false);
    putTask({
      id: UPLOAD_TASK,
      kind: "save-transfer",
      title: `${picked} — 데이터베이스에 덮어쓰는 중`,
      progress: { done: 0, total: 0 },
    });
    try {
      const r = await getBridge()!.saveFileToCloud(picked);
      updateTask(UPLOAD_TASK, {
        progress: undefined,
        title: "데이터베이스 덮어쓰기",
        result: {
          ok: true,
          message: `항목 ${r.entries}건을 올렸습니다. 바꾸기 전 데이터는 "${r.safetySaveName}" 세이브파일에 저장해 뒀습니다.`,
        },
      });
    } catch (e) {
      updateTask(UPLOAD_TASK, {
        progress: undefined,
        title: "데이터베이스 덮어쓰기",
        result: { ok: false, message: e instanceof Error ? e.message : String(e) },
      });
    }
  };

  return (
    <div className="mt-2 flex flex-col gap-3 border-t border-white/8 pt-5">
      <div>
        <h3 className="text-[11px] font-semibold tracking-widest text-white/50 uppercase">
          세이브파일을 데이터베이스로 올리기
        </h3>
        <p className="mt-1 text-[11px] leading-relaxed text-white/30">
          고른 세이브파일의 내용으로 지금 데이터베이스를 <b className="text-amber-200/70">통째로
          바꿉니다.</b> 지금 들어 있는 기록은 사라집니다.
          <br />
          바꾸기 직전에 지금 데이터를 세이브파일로 자동 저장하므로, 되돌릴 수 있습니다.
        </p>
      </div>

      {saves?.length === 0 ? (
        <p className="text-[11px] text-white/30">올릴 세이브파일이 없습니다.</p>
      ) : (
        <div className="flex gap-2">
          <select
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
            /* 덮어쓰는 동안 대상을 못 바꾼다 — 지금 붓고 있는 것과 어긋나면 안 된다 */
            disabled={busy}
            className={FIELD_INPUT}
          >
            <option value="">세이브파일 고르기</option>
            {saves?.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
          <Button
            variant="danger"
            onClick={() => setConfirming(true)}
            disabled={busy || !picked}
          >
            {busy ? "올리는 중" : "덮어쓰기"}
          </Button>
        </div>
      )}

      {/* 결과는 알림으로 간다 — 수십 초가 걸려서 다른 화면에 가 있기 쉽다 */}

      {confirming && (
        <ConfirmDialog
          title="데이터베이스 덮어쓰기"
          confirmLabel="덮어쓰기"
          message={
            <>
              지금 데이터베이스의 기록이 전부 사라지고 <b className="text-white">{picked}</b>의
              내용으로 바뀝니다.
              <span className="mt-2 block text-white/50">
                바꾸기 직전에 지금 데이터를 세이브파일로 자동 저장합니다. 잘못됐다면 그걸 열어
                되돌리실 수 있습니다.
              </span>
            </>
          }
          onClose={() => setConfirming(false)}
          onConfirm={upload}
        />
      )}
    </div>
  );
}

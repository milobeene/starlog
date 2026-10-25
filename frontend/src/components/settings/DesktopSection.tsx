"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, FIELD_INPUT } from "@/components/ui/Field";
import Bytes from "@/components/ui/Bytes";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { CLOUD_BACKUP_TASK } from "@/lib/cloudBackup";
import {
  bridgeMessage,
  getBridge,
  type CloudBackupFile,
  type CloudBackupKind,
  type CloudBackupList,
  type SaveFile,
  type SessionInfo,
} from "@/lib/desktop";
import { putTask, updateTask, useTaskRunning } from "@/lib/tasks";
import { api } from "@/lib/api";
import { invalidateQueries } from "@/lib/useApi";

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
      {/* 받기 전엔 아무 문구도 안 낸다 — 클라우드 접속에서 "로컬 세이브파일" 안내가 번쩍이면 안 된다 */}
      {session === null ? null : session.mode === "cloud" ? (
        <>
          {/* 6시간짜리 Neon 되돌리기 밖의 사본 — 가장 자주 볼 것이라 맨 위에 둔다 */}
          {getBridge()?.cloudBackups && <CloudBackups />}
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

  // 같은 화면의 뽑기·안전망이 새 세이브를 만들므로 한 번만 받으면 목록이 낡는다 — 고를 때마다 다시 받는다
  const loadSaves = () => {
    getBridge()?.saves.list().then(setSaves).catch(() => setSaves([]));
  };
  useEffect(loadSaves, []);

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
      // DB가 통째로 바뀌었다 — 들고 있던 응답은 전부 옛 DB 것이다
      invalidateQueries();
      loadSaves();
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
            onFocus={loadSaves}
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

/**
 * 클라우드 백업 (2026-10-25). 지금 연결의 내보내기를 이 컴퓨터에 한 장씩 남긴다.
 *
 * Neon 무료 플랜은 되돌리기 기록을 6시간만 둔다 — 그 밖의 사본이 이 맥에 있어야 한다.
 * 자동은 하루 한 번(10개까지, 넘치면 오래된 것부터), 수동은 저절로 안 지운다.
 * 진행·결과는 알림으로 간다 — 자동 백업은 이 화면을 열기도 전에 뒤에서 돈다
 */
const RESTORE_TASK = "cloud-backup-restore";

/* 다리 객체가 렌더마다 같은 참조라는 보장이 없다 — 의존성에 넣으면 효과가 매번 다시 돈다. 부를 때 꺼낸다 */
const cloudBridge = () => getBridge()!.cloudBackups!;

function CloudBackups() {
  const [list, setList] = useState<CloudBackupList | null>(null);
  const [name, setName] = useState("");
  const [deleting, setDeleting] = useState<CloudBackupFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useTaskRunning(CLOUD_BACKUP_TASK.manual);
  const restoring = useTaskRunning(RESTORE_TASK);

  const reload = useCallback(() => {
    cloudBridge()
      .list()
      .then((l) => {
        setList(l);
        setError(null);
      })
      .catch((e) => setError(bridgeMessage(e, "백업 목록을 읽지 못했습니다")));
  }, []);

  /* 추천 이름은 지금 시각이라 끝날 때마다 새로 받는다 — 방금 쓴 이름이 그대로 남으면 바로 "이미 있습니다"가 된다 */
  const suggest = useCallback(() => {
    cloudBridge().suggestName().then(setName).catch(() => {});
  }, []);

  useEffect(() => {
    reload();
    suggest();
    // 자동 백업이 이 화면을 연 채로 끝날 수 있다 — 끝난 상태가 오면 목록을 다시 받는다
    return cloudBridge().onStatus((s) => {
      if (s.phase === "done" || s.phase === "failed") reload();
    });
  }, [reload, suggest]);

  const create = async () => {
    const target = name.trim();
    try {
      await cloudBridge().create(target);
      suggest();
    } catch (e) {
      // 이름 검사처럼 시작도 못 한 실패는 메인이 상태를 안 쏜다 — 여기서 같은 자리에 띄운다
      putTask({
        id: CLOUD_BACKUP_TASK.manual,
        kind: "cloud-backup",
        title: "클라우드 백업",
        result: { ok: false, message: `클라우드 백업 실패 — ${bridgeMessage(e, "알 수 없는 오류")}` },
      });
    }
    reload();
  };

  const restore = async (item: CloudBackupFile) => {
    putTask({
      id: RESTORE_TASK,
      kind: "save-transfer",
      title: `${item.label} — 로컬 세이브파일로 푸는 중`,
      progress: { done: 0, total: 0 },
    });
    try {
      const r = await cloudBridge().restore(item.kind, item.fileName);
      updateTask(RESTORE_TASK, {
        progress: undefined,
        title: "클라우드 백업 풀기",
        result: {
          ok: true,
          message: `${r.saveName} 세이브파일을 만들었습니다. 입구의 [로컬 세이브파일]에서 열 수 있습니다.`,
        },
      });
    } catch (e) {
      updateTask(RESTORE_TASK, {
        progress: undefined,
        title: "클라우드 백업 풀기",
        result: { ok: false, message: bridgeMessage(e, "풀지 못했습니다") },
      });
    }
  };

  const openFolder = (kind: CloudBackupKind) => {
    cloudBridge().openFolder(kind).catch((e) => setError(bridgeMessage(e, "폴더를 열지 못했습니다")));
  };

  return (
    <div className="mt-2 flex flex-col gap-3 border-t border-white/8 pt-5">
      <div>
        <h3 className="text-[11px] font-semibold tracking-widest text-white/50 uppercase">
          클라우드 백업
        </h3>
        <p className="mt-1 text-[11px] leading-relaxed text-white/30">
          지금 연결된 데이터를 이 컴퓨터에 파일 한 장으로 남깁니다. 앱을 열 때 하루 한 번 자동으로
          만들어지고, 필요할 때 직접 뽑으실 수도 있습니다. 풀면 새 로컬 세이브파일이 됩니다.
        </p>
      </div>

      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="백업 이름"
          disabled={busy}
          maxLength={50}
          className={FIELD_INPUT}
        />
        <Button variant="primary" onClick={create} disabled={busy || !name.trim()}>
          {busy ? "백업 중" : "백업 뽑기"}
        </Button>
      </div>

      {list === null && !error && <div className="h-12 skeleton-sweep rounded-lg bg-white/[0.06]" />}

      {list && list.items.length === 0 && (
        <p className="text-[11px] text-white/30">아직 백업이 없습니다.</p>
      )}

      {list && list.items.length > 0 && (
        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          {list.items.map((item) => (
            <div
              key={`${item.kind}/${item.fileName}`}
              className="group flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm text-white/90">
                    {item.kind === "auto" ? "자동 백업" : item.label}
                  </span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] tracking-wider ${
                      item.kind === "auto" ? "bg-white/8 text-white/45" : "bg-white/15 text-white/75"
                    }`}
                  >
                    {item.kind === "auto" ? "자동" : "수동"}
                  </span>
                </span>
                <span className="num mt-0.5 block text-[11px] text-white/35">
                  {readableDate(item.createdAt)}
                  <span className="mx-1 text-white/20">·</span>
                  <Bytes bytes={item.sizeBytes} />
                </span>
              </span>
              <button
                onClick={() => restore(item)}
                disabled={restoring}
                className="shrink-0 text-[11px] text-white/40 transition-colors hover:text-white disabled:opacity-40"
              >
                로컬 세이브로 풀기
              </button>
              {item.kind === "manual" && (
                <button
                  onClick={() => setDeleting(item)}
                  className="shrink-0 text-[11px] text-white/0 transition-colors group-hover:text-white/30 hover:!text-red-400"
                >
                  삭제
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {list && (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => openFolder("auto")} disabled={!list.folders.auto}>
            자동 폴더 열기
          </Button>
          <Button onClick={() => openFolder("manual")} disabled={!list.folders.manual}>
            수동 폴더 열기
          </Button>
          <span className="num text-[11px] text-white/30">
            자동 {list.autoCount} / {list.keepAuto}
          </span>
        </div>
      )}

      {/* 규칙이 안 보이면 "내 백업이 왜 없어졌지"가 된다 */}
      <p className="text-[11px] leading-relaxed text-white/25">
        자동 백업은 {list?.keepAuto ?? 10}개까지 남고, 넘으면 오래된 것부터 지워집니다. 직접 뽑은 백업은
        지우기 전까지 남습니다.
      </p>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {deleting && (
        <ConfirmDialog
          title="백업 삭제"
          message={
            <>
              <b className="text-white">{deleting.label}</b> 백업을 지웁니다. 되돌릴 수 없습니다.
            </>
          }
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await cloudBridge().remove(deleting.kind, deleting.fileName);
            setDeleting(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

/** ISO → `2026-10-25 18:10` (이 컴퓨터의 시각) */
function readableDate(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

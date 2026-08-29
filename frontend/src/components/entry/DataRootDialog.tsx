"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import { Button, FIELD_INPUT } from "@/components/ui/Field";
import { getBridge } from "@/lib/desktop";

/**
 * 데이터 폴더 (v1.0, 2026-08-28).
 *
 * ## 왜 팝업인가
 *
 * 입구에 한 줄로 두니 **경로만 보이고 그게 뭔지는 안 보였다.** 여기 무엇이 들어가는지,
 * 바꾸면 어떻게 되는지, 폴더는 어떻게 만드는지가 전부 설명이 필요한 일이라
 * 한 줄에 담을 수가 없다.
 *
 * ## 저장 전에 살펴본다
 *
 * **경로가 이상한 걸 저장한 뒤에 알게 하면 안 된다** — 세이브파일이 엉뚱한 데로 가고
 * 그제서야 "왜 목록이 비었지"가 된다. 쓸 수 있는 곳인지, 이미 우리 구조가 있는지를
 * 확인 버튼 없이 입력하는 동안 계속 알려준다
 */
const FOLDERS = [
  { name: "saves", what: "세이브파일 — 이게 곧 지금의 기록입니다" },
  { name: "backups", what: "백업 — 앱을 열 때마다 자동으로 쌓입니다" },
  { name: "covers", what: "직접 올린 커버 이미지" },
  { name: "media", what: "게임별 스크린샷과 영상" },
];

type Inspection = Awaited<ReturnType<NonNullable<ReturnType<typeof getBridge>>["settings"]["inspectDataRoot"]>>;

export default function DataRootDialog({
  current,
  onClose,
  onChanged,
}: {
  current: string;
  onClose: () => void;
  onChanged: (next: string) => void;
}) {
  const [draft, setDraft] = useState(current);
  const [check, setCheck] = useState<Inspection | null>(null);
  const [busy, setBusy] = useState(false);

  /* 입력하는 동안 계속 살펴본다 — 저장을 누르고 나서 틀렸다고 하면 늦다 */
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      getBridge()?.settings.inspectDataRoot(draft).then((result) => {
        if (!cancelled) setCheck(result);
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draft]);

  const pick = async () => {
    const picked = await getBridge()!.pickFolder();
    if (picked) setDraft(picked);
  };

  const save = async () => {
    setBusy(true);
    try {
      // 저장하면서 없는 폴더를 만든다 — "구조 생성"을 따로 누를 필요가 없다
      await getBridge()!.settings.setDataRoot(draft);
      onChanged(draft);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const changed = draft.trim() !== current;

  return (
    <Modal
      title="데이터 폴더"
      onClose={onClose}
      footer={
        <>
          {/* 앱 폴더가 먼저다 — connections.json을 보러 가는 길이 여기 말고 없다 */}
          <Button onClick={() => getBridge()!.openFolder("appData")}>앱 폴더</Button>
          <Button onClick={() => getBridge()!.openFolder("root")}>지금 폴더 열기</Button>
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" onClick={save} disabled={busy || !check?.ok || !changed}>
            {busy ? "저장 중" : "저장"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div>
          <p className="text-[11px] leading-relaxed text-white/45">
            기록과 파일이 저장되는 곳입니다. 이 폴더 하나만 통째로 복사하면 다른 컴퓨터로 옮길 수
            있습니다.
          </p>
          <ul className="mt-3 flex flex-col gap-1.5">
            {FOLDERS.map((folder) => (
              <li key={folder.name} className="flex gap-2.5 text-[11px]">
                <span className="w-16 shrink-0 font-mono text-white/60">{folder.name}/</span>
                <span className="text-white/35">{folder.what}</span>
              </li>
            ))}
          </ul>
          {/*
            ⚠️ 자격증명은 여기 없다는 걸 분명히 해야 한다 — 데이터 폴더를 외장이나
            공유 폴더에 두는 사람이 "키도 같이 갔겠지" 하고 넘기면 안 된다
          */}
          <p className="mt-3 text-[11px] leading-relaxed text-white/25">
            데이터베이스 비밀번호와 API 키는 여기 들어가지 않습니다. 앱 폴더에 따로 있어서
            이 폴더를 옮기거나 복사해도 따라가지 않습니다.
          </p>
        </div>

        <div className="flex flex-col gap-2 border-t border-white/8 pt-5">
          <div className="text-[10px] font-semibold tracking-widest text-white/40 uppercase">
            위치
          </div>
          <div className="flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
              className={`${FIELD_INPUT} font-mono text-[11px]`}
            />
            <Button onClick={pick}>폴더 고르기</Button>
          </div>

          {check && !check.ok && <p className="text-[11px] text-red-400">{check.reason}</p>}
          {check?.ok && (
            <p className="text-[11px] text-white/35">
              {check.ready
                ? `이미 STARLOG 폴더입니다 — 세이브파일 ${check.saveCount}개가 있습니다.`
                : check.exists
                  ? "있는 폴더입니다. 저장하면 안에 네 폴더를 만듭니다."
                  : "새로 만들 위치입니다. 저장하면 폴더와 구조를 함께 만듭니다."}
            </p>
          )}

          {changed && check?.ok && (
            <p className="text-[11px] leading-relaxed text-amber-200/70">
              기존 폴더의 파일은 따라가지 않습니다. 옮기시려면 지금 폴더를 열어 직접 복사해
              주세요.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

"use client";

import DataRootLine from "@/components/entry/DataRootLine";
import { ENTRY_BUTTON } from "@/components/entry/entryButton";
import type { SessionInfo } from "@/lib/desktop";

const RECENT_NAME = "min-w-0 max-w-[min(52vw,24rem)] truncate";

/** 모드 선택 — [최근 접속]이 첫 자리고, 그 아래 로컬 세이브파일 / 데이터베이스 연결 */
export default function EntryModeChoice({
  session,
  onResume,
  onLocal,
  onCloud,
}: {
  session: SessionInfo | null;
  onResume: () => void;
  onLocal: () => void;
  onCloud: () => void;
}) {
  return (
    <>
      {/*
        **[최근 접속]이 첫 자리다.** 매번 모드를 고르고 목록에서 찾는 게 실제로
        제일 귀찮은 부분이었다. 살아 있으면 즉시, 아니면 5초 — 어느 쪽이든
        고르는 단계가 없다
      */}
      {session && (
        <button
          onClick={onResume}
          className={`${ENTRY_BUTTON} group mb-4 max-w-full border-white/45`}
        >
          {/*
            **두 겹을 같은 칸에 포갠다** (사용자 아이디어). 글자를 접었다 폈다 하는
            앞의 두 방식은 폭이 흔들리거나 이름이 잘렸다. 겹쳐두면 박스가 둘 중
            넓은 쪽에 맞춰 **한 번 정해지고 안 움직인다** — 가운데 정렬도 공짜다
          */}
          <span className="entry-recent">
            {/*
              이름만 줄인다 (2026-10-25). 긴 세이브 이름 하나로 버튼이 380px 화면보다 넓어져 양쪽 글자가
              잘렸다. 두 겹이 **같은 상한**을 써야 포갠 칸의 폭이 한 번 정해지고 안 흔들린다
            */}
            <span className="entry-rest">
              최근 접속 · <span className={RECENT_NAME} title={session.target}>{session.target}</span>
              {/*
                ⚠️ `text-white/45`를 쓰면 **호버해도 흰색 그대로다** — 부모의
                `hover:text-black`은 상속인데 여기서 색을 직접 정해버려 이기지 못한다.
                투명도만 낮추면 부모가 정한 색을 따라간다
              */}
              <span className="opacity-55 normal-case">({session.mode === "local" ? "세이브파일" : "데이터베이스"})</span>
            </span>

            <span className="entry-hover" aria-hidden>
              <span className={RECENT_NAME}>{session.target}</span>
              <span className="entry-arrow">
                <span className="entry-arrow-line" />
                <svg
                  className="entry-arrow-head"
                  viewBox="0 0 6 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {/* 왼쪽 끝까지 당긴다 — 선과 머리 사이에 틈이 안 남게 */}
                  <path d="M0.4 1.6 L5 6 L0.4 10.4" />
                </svg>
              </span>
            </span>
          </span>
        </button>
      )}

      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-4">
        {/*
          이름을 바꿨다 (2026-08-28). "로컬/클라우드"는 **어디 있나**를 말하는데
          사용자가 알아야 하는 건 **그게 뭔가**다. 게다가 오른쪽은 자기 서버여도 되니
          "클라우드"가 부정확하기도 했다. 설명은 안 붙인다 — 화면이 지저분해진다
        */}
        <button onClick={onLocal} className={ENTRY_BUTTON}>
          로컬 세이브파일
        </button>
        <button onClick={onCloud} className={ENTRY_BUTTON}>
          데이터베이스 연결
        </button>
      </div>
      {/*
        데이터 폴더를 바꾸는 건 **세이브파일 위치가 바뀌는 일**이라 백엔드가 뜨기 전인
        여기여야 한다. 설정 화면에 두면 열려 있는 세이브 폴더 밑을 빼는 셈이 된다
      */}
      <DataRootLine />
    </>
  );
}

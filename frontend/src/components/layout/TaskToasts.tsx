"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { closeTask, useTasks, type Task } from "@/lib/tasks";

/** 끝난 알림이 스스로 닫히기까지 (ms) */
const AUTO_CLOSE_MS = 5000;

/**
 * 오래 걸리는 일의 진행·결과 (2026-08-28).
 *
 * ## 화면 중앙 하단에서 올라온다
 *
 * 헤더·사이드바를 안 가리는 자리다. **진행 중에는 안 사라지고, 끝나면 5초 뒤 닫힌다**
 * (2026-10-24 사용자 결정 — 처음엔 닫기 버튼으로만 닫게 했는데 결과가 계속 쌓였다).
 * 마우스를 올려두면 타이머가 멈춘다 — 결과를 읽는 중에 사라지면 안 된다.
 *
 * ## 앱 껍데기에 붙는다
 *
 * 라우팅으로 화면이 바뀌어도 이 컴포넌트는 안 죽는다 — 그래야 탭을 옮겨도 진행이 이어 보인다
 */
export default function TaskToasts() {
  const tasks = useTasks();
  if (tasks.length === 0) return null;

  /*
   * body로 포털한다 (F5). 앱 본문은 루트에서 `z-10` 쌓임 맥락 하나에 통째로 들어 있어서,
   * 안에 두면 z-150이어도 body에 포털된 전체 화면 갤러리(z-90) 아래로 깔린다
   */
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[150] flex flex-col items-center gap-2 px-6">
      {tasks.map((task) => (
        <Toast key={task.id} task={task} />
      ))}
    </div>,
    document.body,
  );
}

function Toast({ task }: { task: Task }) {
  const done = Boolean(task.result);
  const ok = task.result?.ok;
  const [hovered, setHovered] = useState(false);

  // 끝난 순간부터 센다. 호버를 벗어나면 처음부터 다시 5초 (읽던 걸 끝까지 읽게).
  // 결과 객체도 본다 — 같은 id로 새 결과가 오면(빠른 실행 연타) 컴포넌트가 재사용돼 옛 타이머가 남는다
  const result = task.result;
  useEffect(() => {
    if (!result || hovered) return;
    const timer = setTimeout(() => closeTask(task.id), AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [result, hovered, task.id]);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      /*
       * 아래에서 올라온다. `animate-*`를 쓰지 않고 인라인으로 둔 이유 —
       * 이 연출은 여기 하나뿐이라 전역 유틸을 만들 값을 못 한다
       */
      style={{ animation: "toast-rise 260ms cubic-bezier(0.16, 1, 0.3, 1)" }}
      className={`glass-panel pointer-events-auto flex w-full max-w-md flex-col gap-2.5 rounded-xl px-4 py-3.5 !bg-neutral-950/92 ${
        done
          ? ok
            ? "!border-emerald-500/30"
            : "!border-red-500/30"
          : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="min-w-0 flex-1 text-sm text-white/85">{task.title}</span>
        {/*
          **`total`이 0이면 개수를 안 쓴다.** 연결 테스트처럼 몇 단계인지 모르는 일은
          `0 / 0`이 되는데, 그건 "아무것도 안 하고 있다"로 읽힌다 — 아래 도는 막대만 보여준다
        */}
        {task.progress && task.progress.total > 0 && (
          <span className="num shrink-0 text-xs text-white/50">
            {task.progress.done} / {task.progress.total}
          </span>
        )}
        {/* 진행 중에는 못 닫는다 — 닫으면 진행을 볼 데가 없어진다. 중단은 따로 있다 */}
        {done && (
          <button
            onClick={() => closeTask(task.id)}
            aria-label="닫기"
            className="shrink-0 text-lg leading-none text-white/35 transition-colors hover:text-white"
          >
            ×
          </button>
        )}
      </div>

      {task.progress && task.progress.total > 0 && (
        <>
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-white/70 transition-all duration-300"
              style={{ width: `${(task.progress.done / task.progress.total) * 100}%` }}
            />
          </div>
          {task.progress.label && (
            <p className="truncate text-[11px] text-white/35">{task.progress.label}</p>
          )}
        </>
      )}

      {task.progress && task.progress.total === 0 && (
        <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
          <span
            className="block h-full w-1/3 rounded-full bg-white/60"
            style={{ animation: "starlog-sweep 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite" }}
          />
        </div>
      )}

      {/* 부분별 결과 — "실패했습니다" 한 줄이면 어디가 문제인지 알 수가 없다 */}
      {task.result?.lines?.map((line) => (
        <div key={line.label} className="flex items-center gap-2 text-xs">
          <span className={line.ok ? "text-emerald-300" : "text-red-400"}>
            {line.ok ? "✓" : "✕"}
          </span>
          <span className="w-24 shrink-0 text-white/70">{line.label}</span>
          <span className="min-w-0 flex-1 truncate text-white/40">{line.detail ?? ""}</span>
        </div>
      ))}

      {task.result?.message && (
        <p className="text-[11px] leading-relaxed text-white/45">{task.result.message}</p>
      )}

      {!done && task.onAbort && (
        <div className="flex justify-end">
          <button
            onClick={task.onAbort}
            className="text-[11px] text-white/40 underline underline-offset-2 transition-colors hover:text-red-400"
          >
            중단
          </button>
        </div>
      )}

      {/* 결과를 본 다음이 진짜 목적이다 — 저장하거나, 고치러 돌아가거나 */}
      {task.actions && task.actions.length > 0 && (
        <div className="flex flex-wrap justify-end gap-2 pt-0.5">
          {task.actions.map((action) => (
            <button
              key={action.label}
              onClick={action.run}
              className={`rounded-md px-3 py-1.5 text-[11px] font-medium tracking-wide transition-colors ${
                action.primary
                  ? "bg-white text-black hover:bg-white/85"
                  : "border border-white/15 text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

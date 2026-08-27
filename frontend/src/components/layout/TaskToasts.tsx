"use client";

import { closeTask, useTasks, type Task } from "@/lib/tasks";

/**
 * 오래 걸리는 일의 진행·결과 (2026-08-28).
 *
 * ## 화면 중앙 하단에서 올라온다
 *
 * 헤더·사이드바를 안 가리는 자리다. **스스로 안 사라진다** — 다른 화면을 보는 사이에
 * 결과가 없어지면 애초에 이걸 만든 이유가 없어진다. 닫기 버튼으로만 닫힌다.
 *
 * ## 앱 껍데기에 붙는다
 *
 * 라우팅으로 화면이 바뀌어도 이 컴포넌트는 안 죽는다 — 그래야 탭을 옮겨도 진행이 이어 보인다
 */
export default function TaskToasts() {
  const tasks = useTasks();
  if (tasks.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[150] flex flex-col items-center gap-2 px-6">
      {tasks.map((task) => (
        <Toast key={task.id} task={task} />
      ))}
    </div>
  );
}

function Toast({ task }: { task: Task }) {
  const done = Boolean(task.result);
  const ok = task.result?.ok;

  return (
    <div
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
        {task.progress && (
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

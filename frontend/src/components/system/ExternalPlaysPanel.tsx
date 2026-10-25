"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import DataTable from "@/components/library/DataTable";
import ErrorNotice from "@/components/ui/ErrorNotice";
import { Button } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import DetachAllDialog from "./DetachAllDialog";
import { api, ApiError } from "@/lib/api";
import { formatSignedMinutes } from "@/lib/format";
import { putTask } from "@/lib/tasks";
import { invalidateQueries, useApi } from "@/lib/useApi";
import type {
  DeleteDetachedResult,
  DetachAllResult,
  DetachedExternalPlay,
  DetachedExternalPlays,
  ReleaseDetachedResult,
} from "@/lib/types";

const TASK_ID = "external-plays";

/**
 * 연결 끊긴 외부 일정 (2026-10-25).
 *
 * 외부 캘린더에서 사라진(또는 연결을 해제한) 일정은 **STARLOG가 마저 정리한다** — 그 캘린더는 더 고칠 수 없다.
 * 넘기기 = 같은 시간이 일반 기록(ADD)으로 남는다 · 지우기 = 합계에서 빠진다.
 * 화면 문구에 연동 앱 이름을 쓰지 않는다(사용자 결정) — "외부 캘린더"로만 부른다
 */
export default function ExternalPlaysPanel() {
  const detached = useApi<DetachedExternalPlays>("/api/external-plays/detached");
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [confirm, setConfirm] = useState<"release" | "delete" | "detach-all" | null>(null);

  const items = useMemo(() => detached.data?.items ?? [], [detached.data]);
  // 목록이 다시 오면 사라진 줄의 선택은 버린다 — 안 보이는 줄이 같이 넘어가면 안 된다
  const picked = useMemo(() => items.filter((i) => selected.has(i.id)), [items, selected]);
  const pickedFuture = picked.some((i) => !i.counted);

  if (detached.error) {
    if (detached.error instanceof ApiError && detached.error.status === 404) {
      return <p className="text-sm text-white/50">지금 연결된 서버는 외부 일정 정리를 아직 지원하지 않습니다.</p>;
    }
    return <ErrorNotice error={detached.error} onRetry={detached.reload} />;
  }
  if (!detached.data) return <Skeleton className="h-64 w-full" />;

  const { attachedCount, attachedEnded, attachedFuture } = detached.data;
  const allPicked = items.length > 0 && picked.length === items.length;

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const finish = (message: string) => {
    putTask({ id: TASK_ID, kind: "external-plays", title: "외부 일정 정리", result: { ok: true, message } });
    setSelected(new Set());
    // 이 목록·상세 합계·통계가 전부 바뀐다 — 목록도 이걸로 다시 받는다
    invalidateQueries();
  };

  const release = async () => {
    const ids = picked.filter((i) => i.counted).map((i) => i.id);
    const result = await api.post<ReleaseDetachedResult>("/api/external-plays/detached/release", { ids });
    const tail = result.removed > 0 ? ` · 0분이라 기록 없이 정리 ${result.removed}개` : "";
    finish(`일반 기록으로 ${result.released}개를 넘겼습니다${tail}`);
  };

  const remove = async () => {
    const ids = picked.map((i) => i.id);
    const result = await api.post<DeleteDetachedResult>("/api/external-plays/detached/delete", { ids });
    finish(`외부 일정 ${result.deleted}개를 지웠습니다`);
  };

  const detachAll = async () => {
    const result = await api.post<DetachAllResult>("/api/external-plays/detach-all", {});
    finish(`외부 일정 ${result.detached}개를 연결 해제했습니다 — 목록에서 넘기거나 지워 주세요`);
  };

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h3 className="text-[11px] font-semibold tracking-widest text-white/50 uppercase">연결 끊긴 외부 일정</h3>
        <p className="mt-2 text-xs leading-relaxed text-white/40">
          외부 캘린더에서 사라진 일정입니다. 외부 캘린더는 더 이상 이 일정을 고칠 수 없으니, 여기서 일반 기록으로
          넘기시거나 지워 주세요.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="mr-auto flex cursor-pointer items-center gap-2 text-xs text-white/50">
            <input
              type="checkbox"
              className="pick-circle"
              checked={allPicked}
              disabled={items.length === 0}
              onChange={() => setSelected(allPicked ? new Set() : new Set(items.map((i) => i.id)))}
            />
            <span>
              <span className="num">{picked.length}</span>개 선택
            </span>
          </label>
          {pickedFuture && <span className="text-[11px] text-white/35">끝난 일정만 넘길 수 있습니다</span>}
          <Button
            disabled={picked.length === 0 || pickedFuture}
            title={pickedFuture ? "끝난 일정만 넘길 수 있습니다" : undefined}
            onClick={() => setConfirm("release")}
          >
            일반 기록으로 넘기기
          </Button>
          <Button variant="danger" disabled={picked.length === 0} onClick={() => setConfirm("delete")}>
            지우기
          </Button>
        </div>

        <div className="mt-3">
          <DataTable
            headers={["", "Game", "Time", "Duration", "Label"]}
            empty={items.length === 0 ? "연결 끊긴 외부 일정이 없습니다" : undefined}
          >
            {items.map((item) => (
              <Row key={item.id} item={item} checked={selected.has(item.id)} onToggle={() => toggle(item.id)} />
            ))}
          </DataTable>
        </div>
      </section>

      <section className="rounded-lg border border-red-500/20 bg-red-500/[0.03] p-6">
        <h3 className="text-[11px] font-semibold tracking-widest text-red-400/80 uppercase">외부 캘린더 연결 해제</h3>
        <p className="mt-2 text-xs leading-relaxed text-white/45">
          외부 캘린더 앱을 더 쓰지 않으실 때 누릅니다. 아직 연결된 외부 일정을 전부 위 목록으로 옮깁니다.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="num mr-auto text-xs text-white/50">
            연결된 외부 일정 {attachedCount}개 · 끝난 {attachedEnded}개 · 예정 {attachedFuture}개
          </span>
          <Button variant="danger" disabled={attachedCount === 0} onClick={() => setConfirm("detach-all")}>
            외부 캘린더 연결 해제
          </Button>
        </div>
      </section>

      {confirm === "release" && (
        <ConfirmDialog
          title="일반 기록으로 넘기기"
          confirmLabel="넘기기"
          message={
            <>
              선택하신 외부 일정 <span className="num">{picked.length}</span>개를 일반 기록으로 넘깁니다.
              <br />
              같은 시간이 각 게임의 Playtime History에 일반 기록으로 남고, 합계는 그대로입니다. 외부 일정은 목록에서
              사라집니다.
            </>
          }
          onConfirm={release}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === "delete" && (
        <ConfirmDialog
          title="외부 일정 지우기"
          message={
            <>
              선택하신 외부 일정 <span className="num">{picked.length}</span>개를 지웁니다.
              <br />
              끝난 일정의 시간은 플레이타임 합계에서 빠집니다. 되돌릴 수 없습니다.
            </>
          }
          onConfirm={remove}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === "detach-all" && (
        <DetachAllDialog
          counts={{ total: attachedCount, ended: attachedEnded, future: attachedFuture }}
          onConfirm={detachAll}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

/** `2026-10-25 21:00–22:30`. 날을 넘기면 끝에도 날짜를 붙인다 */
function timeRange(startedAt: string, endedAt: string): string {
  const day = (t: string) => t.slice(0, 10);
  const hm = (t: string) => t.slice(11, 16);
  return day(startedAt) === day(endedAt)
    ? `${day(startedAt)} ${hm(startedAt)}–${hm(endedAt)}`
    : `${day(startedAt)} ${hm(startedAt)} – ${day(endedAt)} ${hm(endedAt)}`;
}

function Row({ item, checked, onToggle }: { item: DetachedExternalPlay; checked: boolean; onToggle: () => void }) {
  return (
    <tr className={`transition-colors hover:bg-white/[0.05] ${item.counted ? "" : "opacity-60"}`}>
      <td className="w-10 px-4 py-3">
        <input
          type="checkbox"
          className="pick-circle"
          checked={checked}
          onChange={onToggle}
          aria-label={`${item.entryName} 선택`}
        />
      </td>
      <td className="px-4 py-3 text-white/90">
        <Link href={`/library/detail?entry=${item.entryId}`} className="hover:underline">
          {item.entryName}
        </Link>
      </td>
      <td className="num px-4 py-3 whitespace-nowrap text-white/60">{timeRange(item.startedAt, item.endedAt)}</td>
      <td className="num px-4 py-3 whitespace-nowrap text-white/80">
        {formatSignedMinutes(item.minutes)}
        {!item.counted && <span className="ml-1.5 text-xs text-white/40">예정</span>}
      </td>
      <td className="px-4 py-3 text-white/50">{item.label ?? "—"}</td>
    </tr>
  );
}

"use client";

import { Fragment, useRef, useState } from "react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import RenameDialog from "@/components/settings/RenameDialog";
import { api } from "@/lib/api";
import { toneOf } from "@/lib/tagColors";
import type { FacetCount, TagFacet } from "@/lib/types";

/**
 * 태그·장르 사전 — 이름 변경·삭제 (FR-TAG-02, MUST).
 *
 * 추가는 없다. 게임에 적으면 생기고 다 떼면 사라지는 **IntelliJ 사전 방식**이다 (§6.7).
 *
 * 둘 다 **적용 중인 게임 전부에 한 번에 반영**되므로 개수를 먼저 보여준다 —
 * 삭제는 연결을 통째로 끊는 거라 되돌릴 수 없다
 */
export default function Dictionary({
  label,
  items,
  basePath,
  onDone,
  reorderable,
}: {
  label: string;
  items: FacetCount[];
  basePath: string;
  onDone: () => void;
  /**
   * 드래그로 순서를 바꿀 수 있나 (v1.1). 태그만 켠다 —
   * **이 순서를 라이브러리 사이드바와 폴더 탭이 그대로 따르기 때문**이다.
   * 장르는 따라가는 화면이 없어 순서에 뜻이 없다
   */
  reorderable?: boolean;
}) {
  const [editing, setEditing] = useState<FacetCount | null>(null);
  const [removing, setRemoving] = useState<FacetCount | null>(null);
  /**
   * 순서 바꾸기 — **끌고 있는 동안 실시간으로 자리가 바뀐다** (v1.2).
   *
   * 예전엔 놓아야만 순서가 바뀌어서 "지금 놓으면 어디로 가는지"를 알 수 없었다.
   * 이제 지나가는 항목마다 목록을 즉시 재배열한다 — 손에 든 것이 흐려진 채로
   * 그 자리에 서 있으므로 미리보기가 따로 필요 없다.
   *
   * ⚠️ **`dragId`를 ref로도 들고 있는다.** `dragover`는 초당 수십 번 오는데
   * 상태만 쓰면 그 사이 렌더가 밀려 옛 값을 읽는다.
   *
   * ⚠️ **드롭 후 `onDone()`을 부르지 않는다.** 부르면 서버에서 목록을 다시 받아
   * **옛 순서가 한 번 스쳤다가** 제자리로 온다(사용자가 본 그 깜빡임이다).
   * 우리가 이미 맞는 순서를 들고 있으므로 그대로 두면 된다
   */
  const [order, setOrder] = useState<FacetCount[] | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);
  const shown = order ?? items;

  /* 바깥에서 목록이 바뀌면(이름 변경·삭제) 내 사본을 버린다 */
  const itemKey = items.map((i) => i.id).join(",");
  const [seenKey, setSeenKey] = useState(itemKey);
  if (seenKey !== itemKey) {
    setSeenKey(itemKey);
    setOrder(null);
  }

  /**
   * 놓을 자리를 **포인터 좌표로 정한다** (v1.2).
   *
   * ⚠️ 예전엔 칩 위에 얹혔을 때만 자리를 바꿨다. 양쪽 정렬로 **칩 사이가 넓어지면서**
   * 그 틈에 놓으면 아무 일도 안 일어났다 — 사용자 눈에는 "사이에 두려는데 안 먹는다"다.
   *
   * 컨테이너가 통째로 받고, **각 칩의 가로 중심과 포인터를 견줘** 앞인지 뒤인지 정한다.
   * 줄이 여러 개라 세로도 본다 — 같은 줄(세로 범위 안)에 있는 것만 후보다
   */
  const listRef = useRef<HTMLDivElement>(null);

  const hoverAt = (x: number, y: number) => {
    const from = dragRef.current;
    if (from == null || !listRef.current) return;

    const chips = [...listRef.current.querySelectorAll<HTMLElement>("[data-chip]")];
    let targetId: number | null = null;
    let after = false;

    for (const chip of chips) {
      const r = chip.getBoundingClientRect();
      if (y < r.top || y > r.bottom) continue;   // 다른 줄
      targetId = Number(chip.dataset.chip);
      after = x > r.left + r.width / 2;
      if (!after) break;                          // 이 칩 앞이면 여기서 끝
    }
    if (targetId == null || targetId === from) return;

    setOrder((prev) => {
      const list = prev ?? items;
      const a = list.findIndex((i) => i.id === from);
      let b = list.findIndex((i) => i.id === targetId);
      if (a < 0 || b < 0) return prev;
      if (after) b += 1;
      if (b > a) b -= 1;                          // 자기를 뺀 뒤의 자리
      if (a === b) return prev;
      const next = [...list];
      next.splice(b, 0, ...next.splice(a, 1));
      return next;
    });
  };

  /**
   * 저장하는 동안에는 **드래그를 막는다** (사용자 결정 2026-08-29).
   *
   * ⚠️ 빠르게 여러 번 옮기면 PUT이 겹쳐 **먼저 보낸 옛 순서가 나중에 도착**했다 —
   * 마지막 수정이 사라진 것처럼 보였다.
   *
   * 큐로 마지막 것만 보내는 방법도 있지만, 그러면 **화면에 보이는 순서와 서버의 순서가
   * 잠깐 어긋난 채로 또 끌 수 있다.** 짧게 막는 쪽이 "지금 무엇이 참인가"가 분명하다
   */
  const [saving, setSaving] = useState(false);

  const finish = async () => {
    const moved = dragRef.current;
    dragRef.current = null;
    setDragId(null);
    /*
     * 순서가 그대로면 아무것도 안 보낸다 — 짚었다 그냥 놓는 일이 잦다.
     * 이게 없으면 손만 댔다 떼도 서버 왕복이 일어난다
     */
    if (moved == null || !order) return;
    const same = order.every((item, i) => item.id === items[i]?.id);
    if (same) {
      setOrder(null);
      return;
    }
    setSaving(true);
    try {
      await api.put(`${basePath}/order`, { tagIds: order.map((i) => i.id) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[10px] font-semibold tracking-widest text-white/35 uppercase">
          {label}
        </span>
        <span className="num text-[10px] text-white/25">{items.length}</span>
        {reorderable && items.length > 1 && (
          <span className="text-[10px] text-white/20">
            {saving ? "저장 중…" : "끌어서 순서 변경"}
          </span>
        )}

      </div>

      {shown.length === 0 ? (
        <p className="text-xs text-white/25">사용 중인 항목이 없습니다. 게임에 지정하시면 이곳에 표시됩니다.</p>
      ) : (
        /*
          ⚠️ **글자 양쪽 정렬처럼** 편다 (v1.2, 사용자 지정).
          격자로 폭을 균등하게 나눠봤더니 짧은 태그가 쓸데없이 넓어졌다 —
          원한 것은 **칸을 늘리는 게 아니라 사이를 벌리는 것**이다.
          `text-align: justify`는 인라인 요소에 먹으므로 칩을 `inline-flex`로 둔다.

          ⚠️ **`::after` 트릭을 쓰지 않는다.** 그건 마지막 줄까지 억지로 펴는 장치인데,
          그러면 태그가 두 개 남은 줄이 화면 폭만큼 벌어져 보인다 —
          justify는 원래 마지막 줄을 왼쪽 정렬로 둔다. 그게 맞는 모양이다 (사용자 지정)
        */
        <div
          ref={listRef}
          onDragOver={(e) => {
            if (!reorderable || dragRef.current == null) return;
            e.preventDefault();
            hoverAt(e.clientX, e.clientY);
          }}
          onDrop={(e) => {
            e.preventDefault();
            void finish();
          }}
          className="text-justify"
        >
          {/*
            ⚠️ **칩 사이에 진짜 공백을 넣는다.** JSX는 요소 사이의 줄바꿈을 지우는데,
            `text-align: justify`는 **단어 사이 공백을 늘려서** 줄을 편다 —
            공백이 없으면 늘릴 것이 없어 아무 일도 안 일어난다
          */}
          {shown.map((item) => (
            <Fragment key={item.id}>
            <span
              /* ⚠️ 놓을 자리를 이 표식으로 찾는다 — 없으면 드래그가 통째로 죽는다 */
              data-chip={item.id}
              draggable={reorderable && !saving}
              onDragStart={() => {
                dragRef.current = item.id;
                setDragId(item.id);
              }}
              /* 끌기가 어떻게 끝나든 흐린 상태를 반드시 푼다 — 취소해도 온다 */
              onDragEnd={() => void finish()}
              /* 색이 있으면 칩 전체가 그 톤을 입는다 — 사이드바·폴더와 같은 색이다 */
              style={
                "color" in item && (item as TagFacet).color
                  ? {
                      color: toneOf((item as TagFacet).color).text,
                      background: toneOf((item as TagFacet).color).soft,
                      borderColor: toneOf((item as TagFacet).color).soft,
                    }
                  : undefined
              }
              className={`mb-1.5 inline-flex items-center gap-2 rounded-full border py-1 pr-1.5 pl-2.5 text-left align-middle text-xs ${
                "color" in item && (item as TagFacet).color ? "" : "text-white/70"
              } ${
                !reorderable ? "" : saving ? "cursor-wait opacity-60" : "cursor-grab active:cursor-grabbing"
              } ${
                dragId === item.id
                  ? "border-white/40 bg-white/15 opacity-60"
                  : "border-white/10 bg-white/5"
              }`}
            >
              {item.name}
              <span className="num text-white/25">{item.count}</span>
              <button
                type="button"
                onClick={() => setEditing(item)}
                aria-label={`${item.name} 이름 바꾸기`}
                className="text-white/30 transition-colors hover:text-white"
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setRemoving(item)}
                aria-label={`${item.name} 삭제`}
                className="text-white/30 transition-colors hover:text-red-400"
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>{" "}
            </Fragment>
          ))}
        </div>
      )}

      {editing && (
        <RenameDialog
          item={editing}
          basePath={basePath}
          onClose={() => setEditing(null)}
          onSaved={onDone}
        />
      )}

      {removing && (
        <ConfirmDialog
          title={`${removing.name} 삭제`}
          message={
            <>
              <b className="text-white">{removing.name}</b>을(를) 삭제하시면{" "}
              <b className="text-white">{removing.count}개 항목</b>에서 함께 해제됩니다.
              <br />
              게임 자체는 삭제되지 않으나, 연결은 복구되지 않습니다.
            </>
          }
          onConfirm={async () => {
            await api.del(`${basePath}/${removing.id}`);
            onDone();
          }}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  );
}

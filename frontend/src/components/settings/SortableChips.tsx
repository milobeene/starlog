"use client";

import { Fragment, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { flowCollision, flowSortingStrategy, measureSpace } from "@/components/settings/flowLayout";

/** 칩 하나를 그리는 쪽(Dictionary)이 받는 것 — 상자에 그대로 펼쳐 붙이면 된다 */
export type ChipDrag = {
  ref?: (node: HTMLElement | null) => void;
  style?: CSSProperties;
  /** dnd-kit이 주는 접근성 속성 + 끌기 이벤트 */
  handlers?: Record<string, unknown>;
  /** 자리를 비워 둔 원본 칩 (끌리는 동안 제자리 표식으로 남는다) */
  dragging?: boolean;
  /** 포인터를 따라다니는 복제본 */
  overlay?: boolean;
};

const ANNOUNCE = {
  screenReaderInstructions: {
    draggable:
      "스페이스바로 칩을 집고, 방향키로 옮기고, 스페이스바로 놓습니다. Esc로 취소합니다.",
  },
  announcements: {
    onDragStart: () => "칩을 집었습니다",
    onDragOver: () => undefined,
    onDragEnd: () => "놓았습니다",
    onDragCancel: () => "취소했습니다",
  },
};

/**
 * 끌어서 순서를 바꾸는 칩 목록 (dnd-kit). **놓았을 때만** `onReorder`가 불린다.
 *
 * - 끄는 동안 나머지 칩이 **부드럽게 밀려난다** (`useSortable`의 transform + transition).
 *   미는 좌표는 줄바꿈·양쪽 정렬을 흉내 낸 `flowLayout`이 정한다 — 이유는 그 파일 머리에.
 * - 손에 든 칩은 `DragOverlay`가 그린다. 원본은 앉을 자리에 흐리게 남아 "여기에 놓인다"를 보여준다.
 * - 5px 움직여야 끌기가 시작된다 — 칩 안의 이름 변경·삭제 버튼 클릭이 끌기로 먹히지 않게.
 *   키보드(스페이스 → 방향키 → 스페이스)로도 옮긴다
 */
export default function SortableChips<T extends { id: number }>({
  items,
  disabled,
  onReorder,
  renderChip,
}: {
  items: T[];
  disabled?: boolean;
  onReorder: (next: T[]) => void;
  renderChip: (item: T, drag: ChipDrag) => ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  /* 공백 폭은 끌기를 시작할 때 잰다 — 글꼴·창 크기가 그때그때 다를 수 있다 */
  const [space, setSpace] = useState(4);
  const [activeId, setActiveId] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const strategy = useMemo(() => flowSortingStrategy(space), [space]);
  const collision = useMemo(() => flowCollision(ids, space), [ids, space]);

  const start = (e: DragStartEvent) => {
    if (containerRef.current) setSpace(measureSpace(containerRef.current));
    setActiveId(Number(e.active.id));
  };
  const end = (e: DragEndEvent) => {
    setActiveId(null);
    if (!e.over) return;
    const from = ids.indexOf(Number(e.active.id));
    const to = ids.indexOf(Number(e.over.id));
    if (from < 0 || to < 0 || from === to) return;
    onReorder(arrayMove(items, from, to));
  };

  const active = activeId == null ? null : items.find((i) => i.id === activeId);

  return (
    <DndContext
      id="chip-order"
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={start}
      onDragEnd={end}
      onDragCancel={() => setActiveId(null)}
      accessibility={ANNOUNCE}
    >
      <SortableContext items={ids} strategy={strategy} disabled={disabled}>
        {/*
          ⚠️ **글자 양쪽 정렬처럼** 편다 (v1.2, 사용자 지정) — 칩 사이에 진짜 공백이 있어야
          `text-align: justify`가 늘릴 것이 생긴다. 줄 계산은 flowLayout이 이 규칙을 흉내 낸다
        */}
        <div ref={containerRef} className="text-justify">
          {items.map((item) => (
            <Fragment key={item.id}>
              <SortableChip item={item} disabled={disabled} renderChip={renderChip} />{" "}
            </Fragment>
          ))}
        </div>
      </SortableContext>

      <DragOverlay>{active ? renderChip(active, { overlay: true }) : null}</DragOverlay>
    </DndContext>
  );
}

function SortableChip<T extends { id: number }>({
  item,
  disabled,
  renderChip,
}: {
  item: T;
  disabled?: boolean;
  renderChip: (item: T, drag: ChipDrag) => ReactNode;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled,
  });
  return renderChip(item, {
    ref: setNodeRef,
    style: { transform: CSS.Translate.toString(transform), transition },
    handlers: { ...attributes, ...listeners },
    dragging: isDragging,
  });
}

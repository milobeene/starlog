import { arrayMove } from "@dnd-kit/sortable";
import type { ClientRect, CollisionDetection, UniqueIdentifier } from "@dnd-kit/core";
import type { SortingStrategy } from "@dnd-kit/sortable";

/**
 * 칩이 **줄바꿈되며 양쪽 정렬(`text-justify`)로 흐르는** 목록의 미리보기 배치.
 *
 * dnd-kit의 기본 전략(`rectSortingStrategy`)은 항목을 "이웃의 칸"으로 옮기고 크기를 칸에 맞춰
 * 늘이거나 줄인다. 폭이 제각각인 칩은 그러면 겹치거나 글자가 일그러진다. 그래서 **브라우저가
 * 실제로 하는 배치를 흉내 낸다**: 순서를 바꾼 목록을 폭 그대로 줄에 채우고(넘치면 다음 줄),
 * 마지막 줄을 뺀 줄은 남는 폭을 칩 사이에 똑같이 나눈다.
 *
 * 입력은 **드래그 시작 때 잰 칩들의 상자**(원래 순서)와 사이 공백 폭뿐이다.
 * 줄 높이·컨테이너 폭도 상자에서 뽑는다 — 줄이 한 번이라도 넘어갔다면 가장 오른쪽 칩의 끝이
 * 곧 컨테이너 오른쪽 끝이다 (양쪽 정렬된 줄은 그 끝에 닿는다)
 */

type Box = Pick<ClientRect, "left" | "top" | "width" | "height">;
type Pos = { left: number; top: number };

/** `mb-1.5` — 줄 사이 간격. 줄이 하나뿐일 때 다음 줄 위치를 어림하는 데 쓴다 */
const ROW_GAP = 6;

/**
 * `order`(원래 번호의 새 순서)대로 흘렸을 때 **원래 번호별** 왼쪽 위 좌표.
 * `order`가 항등이면 입력 상자의 좌표가 그대로 나와야 한다 (개발 중 확인용 불변식)
 */
export function flowLayout(boxes: Box[], order: number[], space: number): Pos[] {
  const left = Math.min(...boxes.map((b) => b.left));
  const right = Math.max(...boxes.map((b) => b.left + b.width));
  const avail = right - left;

  /* 줄의 세로 위치 — 같은 줄의 칩은 top이 거의 같다(소수점 차이는 한 줄로 묶는다) */
  const tops: number[] = [];
  for (const t of boxes.map((b) => b.top).sort((a, b) => a - b)) {
    if (tops.length === 0 || t - tops[tops.length - 1] > boxes[0].height / 2) tops.push(t);
  }
  const pitch = tops.length > 1 ? tops[1] - tops[0] : boxes[0].height + ROW_GAP;
  const lineTop = (k: number) =>
    k < tops.length ? tops[k] : tops[tops.length - 1] + (k - tops.length + 1) * pitch;

  /* 줄 채우기 — 칩 하나가 들어갈 때마다 공백 하나가 앞에 붙는다 */
  const lines: number[][] = [];
  let cur: number[] = [];
  let used = 0;
  for (const i of order) {
    const w = boxes[i].width;
    if (cur.length > 0 && used + space + w > avail + 0.5) {
      lines.push(cur);
      cur = [];
      used = 0;
    }
    used += (cur.length > 0 ? space : 0) + w;
    cur.push(i);
  }
  if (cur.length > 0) lines.push(cur);

  const out: Pos[] = new Array(boxes.length);
  lines.forEach((line, k) => {
    const last = k === lines.length - 1;
    const sum = line.reduce((s, i) => s + boxes[i].width, 0);
    /* 마지막 줄과 칩이 하나뿐인 줄은 왼쪽 정렬 — 브라우저가 그렇게 둔다 */
    const gap = last || line.length < 2 ? space : (avail - sum) / (line.length - 1);
    let x = left;
    for (const i of line) {
      out[i] = { left: x, top: lineTop(k) };
      x += boxes[i].width + gap;
    }
  });
  return out;
}

const identity = (n: number) => Array.from({ length: n }, (_, i) => i);

/** 드래그 중 각 칩이 얼마나 비켜 있어야 하나 — 항목마다 불리며, 위의 흐름 배치와의 차이다 */
export function flowSortingStrategy(space: number): SortingStrategy {
  return ({ activeIndex, index, rects, overIndex }) => {
    if (activeIndex < 0 || overIndex < 0 || rects.length === 0) return null;
    const order = arrayMove(identity(rects.length), activeIndex, overIndex);
    const pos = flowLayout(rects, order, space)[index];
    const from = rects[index];
    if (!pos || !from) return null;
    return { x: pos.left - from.left, y: pos.top - from.top, scaleX: 1, scaleY: 1 };
  };
}

/**
 * 놓을 자리 — **끌고 있는 칩이 어느 자리에 앉았을 때 포인터(칩 중심)에 가장 가까운가**.
 *
 * "어느 칩 위에 있나"로 정하면 칩 사이의 넓은 틈과 줄 끝에서 판정이 사라지고,
 * 미리보기가 밀리고 난 뒤 위치로 다시 판정하면 깜빡인다. 여기서는 후보 자리마다
 * 끌린 칩의 앉을 좌표를 계산해 비교하므로 **판정이 포인터 위치만의 함수**다 —
 * 미리보기가 어떻게 밀려 있든 결과가 같아 떨리지 않는다.
 * 세로는 두 배로 쳐서 같은 줄의 자리를 우선한다 (띠 안에 있으면 0 — 같은 줄 안에서는 가로로만 정한다)
 */
export function flowCollision(ids: UniqueIdentifier[], space: number): CollisionDetection {
  return ({ active, collisionRect, droppableRects }) => {
    const activeIndex = ids.indexOf(active.id);
    const boxes = ids.map((id) => droppableRects.get(id));
    if (activeIndex < 0 || boxes.some((b) => !b)) return [];
    const rects = boxes as ClientRect[];

    const cx = collisionRect.left + collisionRect.width / 2;
    const cy = collisionRect.top + collisionRect.height / 2;
    const me = rects[activeIndex];

    /* 목록 위·아래 바깥으로 끌고 나가면 맨 앞·맨 뒤다 — 빈 곳에 놓는 사람은 "끝으로"를 뜻한다 */
    if (cy > Math.max(...rects.map((r) => r.top + r.height))) return [{ id: ids[ids.length - 1] }];
    if (cy < Math.min(...rects.map((r) => r.top))) return [{ id: ids[0] }];

    let best = -1;
    let bestDist = Infinity;
    for (let j = 0; j < ids.length; j++) {
      const at = flowLayout(rects, arrayMove(identity(ids.length), activeIndex, j), space)[activeIndex];
      const dx = at.left + me.width / 2 - cx;
      /* 세로는 그 줄의 띠(칩 높이)까지의 거리 — 띠 안이면 0. 목록 아래쪽 빈 곳에 놓으면 마지막 줄이 이긴다 */
      const dy = Math.max(0, at.top - cy, cy - (at.top + me.height)) * 2;
      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        best = j;
      }
    }
    return best < 0 ? [] : [{ id: ids[best] }];
  };
}

/** 칩 사이 공백(`{" "}`) 한 칸의 폭. 컨테이너의 글꼴로 잰다 — 양쪽 정렬이 이 폭을 기준으로 늘린다 */
export function measureSpace(container: HTMLElement): number {
  const probe = document.createElement("span");
  probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre";
  probe.textContent = " ";
  container.appendChild(probe);
  const width = probe.getBoundingClientRect().width;
  container.removeChild(probe);
  return width || 4;
}

/**
 * 앵커 아래에 띄우는 패널의 자리를 정한다.
 *
 * **왜 필요한가** — 지금까지는 `top: rect.bottom + 4`로 무조건 아래에 붙였다.
 * 그러면 다이얼로그 하단의 날짜 칸을 눌렀을 때 달력이 화면 밖으로 내려가 절반이 잘렸다.
 *
 * 규칙 셋:
 *   1. 아래 공간이 모자라고 **위가 더 넓으면** 위로 뒤집는다
 *   2. 좌우는 화면 안으로 밀어 넣는다 (오른쪽 정렬이면 오른쪽 기준으로)
 *   3. 그래도 안 들어가면 **최대 높이를 주고 스크롤**시킨다 — 잘리는 것보다 낫다
 *
 * `position: fixed` 좌표를 돌려준다. 패널은 포탈로 body에 붙는 전제다
 */
export type AnchorPlacement = {
  top: number;
  left?: number;
  right?: number;
  maxHeight: number;
  /** 위로 뒤집혔나. 애니메이션 방향을 맞추고 싶을 때 쓴다 */
  flipped: boolean;
};

const GAP = 4;
/** 화면 가장자리에 딱 붙으면 답답하다 */
const MARGIN = 8;

export function placeBelow(
  anchor: DOMRect,
  panel: { width: number; height: number },
  align: "left" | "right" = "left",
): AnchorPlacement {
  const viewportH = window.innerHeight;
  const viewportW = window.innerWidth;

  const spaceBelow = viewportH - anchor.bottom - GAP - MARGIN;
  const spaceAbove = anchor.top - GAP - MARGIN;

  // 아래가 충분하면 그냥 아래. 모자라도 위보다 넓으면 아래에 두고 높이를 줄인다
  const flipped = panel.height > spaceBelow && spaceAbove > spaceBelow;

  const maxHeight = Math.max(120, flipped ? spaceAbove : spaceBelow);
  const height = Math.min(panel.height, maxHeight);
  const top = flipped ? anchor.top - GAP - height : anchor.bottom + GAP;

  /*
   * **세로도 화면 안으로 밀어 넣는다.** 좌우만 클램프하고 세로를 안 하면,
   * 앵커가 스크롤로 화면 밖으로 밀려났을 때 `top`이 음수가 되어 패널 윗줄이
   * 잘려 나가고 손댈 수 없게 된다. maxHeight의 바닥값(120)과 top이 따로 놀아도 같은 일이 난다
   */
  const clampedTop = Math.min(
    Math.max(MARGIN, top),
    Math.max(MARGIN, viewportH - MARGIN - height),
  );

  if (align === "right") {
    // 오른쪽 정렬은 right로 잡는다 — 패널 폭이 바뀌어도 오른쪽 모서리가 안 흔들린다.
    // 왼쪽으로 넘치는 것도 막아야 한다: 앵커가 화면 왼쪽에 있으면 패널이 밖으로 나간다
    const right = Math.min(
      Math.max(MARGIN, viewportW - anchor.right),
      Math.max(MARGIN, viewportW - panel.width - MARGIN),
    );
    return { top: clampedTop, right, maxHeight, flipped };
  }

  const left = Math.min(Math.max(MARGIN, anchor.left), viewportW - panel.width - MARGIN);
  return { top: clampedTop, left: Math.max(MARGIN, left), maxHeight, flipped };
}

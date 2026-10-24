import { useEffect, type RefObject } from "react";

/** 가장자리에서 이만큼 안쪽부터 스크롤이 시작된다 (px) */
const ZONE = 80;
/** 가장자리(와 그 바깥)에서의 속도 (px/초) */
const MAX_SPEED = 900;

/**
 * 가장자리까지 **얼마나 들어왔나(0~1)**를 속도로 바꾼다.
 *
 * 선형이면 영역 입구에서도 곧바로 빨라서 "살짝 닿았을 뿐인데 쭉 밀린다".
 * 제곱 곡선은 입구 근처에서 거의 기어가다가 끝에 가까울수록 급하게 올라간다 —
 * t=0.25면 최대의 6%, t=0.5면 25%, t=1이면 100%
 */
export function autoScrollSpeed(depth: number): number {
  const t = Math.min(1, Math.max(0, depth / ZONE));
  return MAX_SPEED * t * t;
}

/**
 * 끌고 있는 동안 `ref` 요소를 위·아래로 자동 스크롤한다 (네이티브 HTML5 드래그용).
 *
 * 브라우저가 가장자리 몇 px에서 알아서 밀어주긴 하지만 영역이 좁고 느려서
 * 긴 목록 끝까지 못 간다. `dragover`는 포인터가 멈춰 있어도 주기적으로 오므로
 * 마지막 좌표를 들고 rAF로 매 프레임 밀면 된다 (프레임 간격으로 곱해서 주사율과 무관).
 *
 * 포인터가 요소 **위·아래 바깥**으로 나가도 가로가 요소 안이면 최대 속도로 계속 민다 —
 * 맨 끝으로 끌어 올릴 때 가장자리에서 멈추면 어색하다
 */
export function useDragAutoScroll(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let pointer: { x: number; y: number } | null = null;
    let raf = 0;
    let last = 0;
    /* scrollTop이 정수로 잘리는 화면이 있어 1px 미만의 이동은 모아 두었다가 민다 */
    let carry = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(now - last, 50) / 1000;
      last = now;
      if (!pointer) return;

      const rect = el.getBoundingClientRect();
      if (pointer.x < rect.left || pointer.x > rect.right) {
        carry = 0;
        return;
      }
      const zone = Math.min(ZONE, rect.height / 3);
      const top = pointer.y - rect.top; // 위 가장자리에서 안쪽으로 얼마나
      const bottom = rect.bottom - pointer.y;
      let dir = 0;
      let depth = 0;
      if (top < zone) {
        dir = -1;
        depth = zone - top;
      } else if (bottom < zone) {
        dir = 1;
        depth = zone - bottom;
      }
      if (dir === 0) {
        carry = 0;
        return;
      }
      /* 영역이 작은 요소에선 ZONE 기준 곡선을 영역 길이에 맞춰 늘린다 */
      carry += dir * autoScrollSpeed((depth / zone) * ZONE) * dt;
      const step = Math.trunc(carry);
      if (step !== 0) {
        el.scrollTop += step;
        carry -= step;
      }
    };

    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      pointer = null;
      carry = 0;
    };
    const onStart = (e: DragEvent) => {
      /* 이 요소 안에서 시작한 끌기만 — 본문의 카드를 끌 때는 밀지 않는다 */
      if (!(e.target instanceof Node) || !el.contains(e.target)) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    const onOver = (e: DragEvent) => {
      pointer = { x: e.clientX, y: e.clientY };
    };

    window.addEventListener("dragstart", onStart);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragend", stop);
    window.addEventListener("drop", stop);
    return () => {
      stop();
      window.removeEventListener("dragstart", onStart);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragend", stop);
      window.removeEventListener("drop", stop);
    };
  }, [ref]);
}

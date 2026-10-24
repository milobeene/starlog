/**
 * 배경 셰이더가 "지금 움직여야 하나"를 묻는 곳 (F4).
 *
 * 사용자가 아무것도 안 하거나 창이 가려져 있는데 전체 화면 노이즈를 60fps로 계속 그리면
 * GPU만 먹는다. 맥의 움직이는 배경화면처럼 **멈춰 있으면 서서히 느려져 정지**하고,
 * 손이 닿으면 다시 흐르게 한다. 여기는 "움직여야 하나"만 답하고 속도 보간은 FluidCanvas가 한다.
 *
 * 입력 리스너는 구독자가 있을 때만 단다 — 캔버스가 여럿(전역 + 설정 미리보기)이어도 한 벌이다
 */

/** 마지막 입력 뒤 이만큼 지나면 느려지기 시작한다 */
export const IDLE_MS = 10_000;

let lastInput = typeof performance === "undefined" ? 0 : performance.now();
/** 창 포커스. 입력이 오면 포커스가 있다고 본다 — 일렉트론의 숨은 창 등 이벤트가 안 오는 경우 대비 */
let focused = true;
let hidden = typeof document !== "undefined" && document.visibilityState === "hidden";

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

function onInput() {
  lastInput = performance.now();
  focused = true;
  notify();
}
const onBlur = () => {
  focused = false;
};
const onFocus = () => {
  focused = true;
  lastInput = performance.now();
  notify();
};
const onVisibility = () => {
  hidden = document.visibilityState === "hidden";
  if (!hidden) onFocus();
};

const INPUT_EVENTS = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart", "resize"] as const;

function install() {
  INPUT_EVENTS.forEach((name) => window.addEventListener(name, onInput, { passive: true }));
  // scroll은 버블링하지 않는다 — 안쪽 스크롤 상자(.overflow-y-auto)까지 잡으려면 캡처로
  window.addEventListener("scroll", onInput, { passive: true, capture: true });
  window.addEventListener("blur", onBlur);
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisibility);
}

function uninstall() {
  INPUT_EVENTS.forEach((name) => window.removeEventListener(name, onInput));
  window.removeEventListener("scroll", onInput, { capture: true });
  window.removeEventListener("blur", onBlur);
  window.removeEventListener("focus", onFocus);
  document.removeEventListener("visibilitychange", onVisibility);
}

/** 활동이 생기면 `onWake`가 불린다. 해제 함수를 돌려준다 */
export function subscribeActivity(onWake: () => void): () => void {
  if (listeners.size === 0) install();
  listeners.add(onWake);
  return () => {
    listeners.delete(onWake);
    if (listeners.size === 0) uninstall();
  };
}

/** 가려졌거나 포커스를 잃었거나 오래 입력이 없으면 거짓 */
export function isActive(now: number): boolean {
  return !hidden && focused && now - lastInput < IDLE_MS;
}

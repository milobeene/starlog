/**
 * 배경 일(배경 썸네일·파일 캐시 데우기·감시가 찾은 파일 만들기)을 **언제 해도 되나** — 사용자가 STARLOG를 보고 있을 때만.
 *
 * 사용자는 STARLOG를 켜 둔 채 같은 PC(8스레드 CPU, VRAM 8GB)에서 에뮬레이터·AAA 게임을 한다 (2026-10-26).
 * 뒤에서 썸네일 수천 장을 푸는 동안 게임이 끊기면 안 된다. 그래서:
 *
 * - 창에 **포커스가 있거나**, 창이 보이고(최소화·숨김 아님) **1분 안에 입력이 있었을 때**만 "활성"
 * - 포커스를 잃거나 최소화·숨김이면 **바로** 비활성 — 배경 일은 다음 장을 꺼내지 않는다 (돌던 한 장은 끝낸다, ~30ms)
 * - 화면이 지금 부르는 썸네일(보이는 그리드)은 이 문을 안 지난다 — 그건 사용자가 기다리는 것이다
 *
 * 포커스는 창 이벤트로 든다 (`isFocused()`를 매번 묻지 않는다) — 시험이 창 이벤트로 흉내 낼 수 있게
 */
const timing = require("./mediaTiming");

const INPUT_WINDOW_MS = 60_000;

let focused = false;
let visible = false;
let lastInput = 0;
let waiters = [];
let wasActive = false;
let expiry = null;
const listeners = new Set();

function isActive() {
  return focused || (visible && Date.now() - lastInput < INPUT_WINDOW_MS);
}

function changed(reason) {
  const now = isActive();
  if (now !== wasActive) {
    wasActive = now;
    timing.mark("gate", { active: now, reason });
    for (const fn of listeners) fn(now);
  }
  // "보이고 입력 1분" 창이 끝나는 순간을 잡는다 — 이벤트가 없어도 비활성으로 넘어가야 기록이 맞다
  clearTimeout(expiry);
  if (now && !focused) expiry = setTimeout(() => changed("idle"), Math.max(0, INPUT_WINDOW_MS - (Date.now() - lastInput)) + 50);
  if (!now) return;
  const ready = waiters;
  waiters = [];
  for (const fn of ready) fn();
}

/** 본 창에 붙인다. 숨긴 창(공장)은 여기 안 온다 */
function attach(win) {
  focused = win.isFocused();
  visible = win.isVisible() && !win.isMinimized();
  win.on("focus", () => { focused = true; visible = true; changed("focus"); });
  win.on("blur", () => { focused = false; changed("blur"); });
  win.on("minimize", () => { visible = false; focused = false; changed("minimize"); });
  win.on("hide", () => { visible = false; focused = false; changed("hide"); });
  win.on("restore", () => { visible = true; changed("restore"); });
  win.on("show", () => { visible = true; changed("show"); });
  win.webContents.on("before-input-event", () => input());
  changed("attach");
}

/** 키보드는 `before-input-event`로, 마우스·휠은 화면이 몇 초에 한 번 알려 준다 (`preload.js`) */
function input() {
  const was = isActive();
  lastInput = Date.now();
  if (!was || !focused) changed("input");
}

/** 활성이 될 때까지 기다린다. `canceled()`가 참이면 그만 기다린다 (세션 끝) */
function waitActive(canceled = () => false) {
  if (isActive()) return Promise.resolve(true);
  return new Promise((resolve) => {
    let poll = null;
    const finish = (v) => { clearInterval(poll); resolve(v); };
    const check = () => {
      if (canceled()) finish(false);
      else if (isActive()) finish(true);
      else waiters.push(check);
    };
    waiters.push(check);
    // 세션이 끝났는데 활성이 안 오면 영영 남는다 — 가끔 들여다본다
    poll = setInterval(() => { if (canceled()) finish(false); }, 1000);
  });
}

/** 활성·비활성이 바뀔 때 (`main.js`가 빠른 공장을 닫는 데 쓴다) */
function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

module.exports = { attach, input, isActive, waitActive, onChange };

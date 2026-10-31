/**
 * 등록한 외부 폴더(스팀·ShareX …)의 썸네일을 **미리** 만든다 — 안 그러면 화면이 부를 때까지 흐린 자리표시만 오래 보인다.
 *
 * 사용자는 게임을 하며 STARLOG를 켜 둔다. 그래서 STARLOG 안 폴더의 배경 썸네일과 같은 규칙이다:
 * - `mediaGate`가 활성(포커스 또는 보이고 1분 안 입력)일 때만 다음 장을 꺼낸다. 비활성이면 멈췄다 돌아오면 이어서
 * - 낮은 순위 줄(`priority: "low"`) · 레인 2개 · 한 장마다 잠깐 쉼. 화면이 부른 것(높은 순위)은 늘 먼저다
 * - 화면이 지금 보는 폴더·묶음의 파일을 앞줄에 둔다 (`enqueue`의 `firstKey`)
 * 영상은 안 만든다 (예전 길: OS 썸네일). 만든 것은 앱 캐시(`thumb-cache`)에만 쓴다 — 사용자 폴더는 읽기만
 */
const fs = require("fs");
const path = require("path");
const sources = require("./sources");
const extMedia = require("./extMedia");
const thumbs = require("./thumbs");
const gate = require("./mediaGate");
const timing = require("./mediaTiming");

const LANES = 2;
const YIELD_MS = 15;
const START_DELAY_MS = 3000;

let run = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 세션을 열 때 — 등록된 폴더를 하나씩 훑어 줄에 올린다 (STARLOG를 보고 있을 때만) */
function start() {
  stop();
  const current = { canceled: false, queue: [], seen: new Set(), pumping: false, made: 0, timer: null };
  run = current;
  current.timer = setTimeout(async () => {
    try {
      for (const s of sources.list()) {
        if (current.canceled) return;
        if (!s.ok) continue;
        if (!gate.isActive() && !(await gate.waitActive(() => current.canceled))) return;
        const { src, groups } = await sources.scan(s.id);
        enqueue(src.id, src.root, groups, null);
      }
    } catch (e) {
      console.warn("[ext-pregen] 훑기 실패", e?.message ?? e);
    }
  }, START_DELAY_MS);
}

function stop() {
  const current = run;
  run = null;
  if (!current) return;
  current.canceled = true;
  clearTimeout(current.timer);
  extMedia.flushAll();
}

/**
 * 한 폴더의 훑은 결과를 줄에 올린다. 같은 폴더가 이미 줄에 있으면 새 목록으로 갈아끼운다.
 * `firstKey`(화면이 보는 묶음)의 파일이 맨 앞
 */
function enqueue(sourceId, root, groups, firstKey) {
  const current = run;
  if (!current || current.canceled) return;
  const hinted = [], rest = [];
  for (const g of groups) {
    for (const it of g.items) {
      if (it.kind === "VIDEO") continue;
      (g.key === firstKey ? hinted : rest).push({ sourceId, rel: it.rel, file: path.join(root, ...it.rel.split("/")) });
    }
  }
  current.queue = [...hinted, ...current.queue.filter((w) => w.sourceId !== sourceId), ...rest];
  void pump(current);
}

async function pump(current) {
  if (current.pumping) return;
  current.pumping = true;
  const t0 = performance.now();
  try {
    await Promise.all(Array.from({ length: LANES }, () => lane(current)));
  } finally {
    current.pumping = false;
    extMedia.flushAll();
    if (current.made > 0) timing.mark("extpregen.done", { n: current.made, ms: Math.round(performance.now() - t0) });
    current.made = 0;
  }
}

async function lane(current) {
  while (!current.canceled) {
    // 사용자가 다른 창(게임)으로 가면 다음 장을 안 꺼낸다 — 돌아오면 이어서
    if (!gate.isActive()) {
      timing.mark("extpregen.pause", { left: current.queue.length });
      if (!(await gate.waitActive(() => current.canceled))) return;
      continue;
    }
    const w = current.queue.shift();
    if (!w) return;
    let st;
    try { st = fs.statSync(w.file, { bigint: true }); } catch { continue; }   // 그새 옮겨졌거나 지워짐
    const tgt = extMedia.target(w.sourceId, w.rel);
    const key = `${tgt.key}@${st.mtimeNs}`;
    if (current.seen.has(key) || tgt.fresh(st)) continue;
    const known = tgt.get();
    if (known && known.t === 0 && known.m === st.mtimeNs.toString() && known.s === Number(st.size)) continue;   // 못 만드는 판
    current.seen.add(key);
    await thumbs.generate(w.file, { priority: "low", ext: tgt });
    current.made++;
    await sleep(YIELD_MS);
  }
}

module.exports = { start, stop, enqueue };

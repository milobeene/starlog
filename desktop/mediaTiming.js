/**
 * 스크린샷 속도 기록 — 윈도우 실기에서 어디가 느린지 재려고 둔다. 평소엔 꺼져 있고 아무것도 안 쓴다.
 *
 * 켜는 법 (둘 중 하나):
 * - 환경변수 `STARLOG_MEDIA_TIMING=1`로 앱을 띄운다
 * - `<앱 데이터>/media-timing.on` 빈 파일을 만든다 (윈도우: `%APPDATA%\starlog\media-timing.on`) — 앱을 다시 켜면 읽는다
 *
 * 결과는 `<앱 데이터>/media-timing.log`(`backend.log` 옆)에 한 줄에 하나(JSON). 서버 쪽(목록 시간)은 `backend.log`에 `[media-timing]`으로
 */
const fs = require("fs");
const path = require("path");
const paths = require("./paths");

let enabled = null;
let file = null;
let buffer = [];
let timer = null;

function on() {
  if (enabled !== null) return enabled;
  try {
    // backend.log와 같은 곳 — `userData`는 앱 이름(패키징하면 STARLOG)을 따라가 개발판과 갈린다
    const dir = paths.APP_DATA;
    file = path.join(dir, "media-timing.log");
    enabled = process.env.STARLOG_MEDIA_TIMING === "1" || fs.existsSync(path.join(dir, "media-timing.on"));
  } catch {
    enabled = false;
  }
  return enabled;
}

function mark(event, data = {}) {
  if (!on()) return;
  buffer.push(JSON.stringify({ t: new Date().toISOString(), event, ...data }));
  if (!timer) timer = setTimeout(flush, 500);
}

function flush() {
  timer = null;
  if (buffer.length === 0 || !file) return;
  const lines = buffer.join("\n") + "\n";
  buffer = [];
  fs.appendFile(file, lines, () => {});
}

/** 화면이 보낸 기록 — 이름·숫자만 받는다 (아무 객체나 로그에 붓지 않게) */
function fromRenderer(event, data) {
  if (!on() || typeof event !== "string" || !/^[a-z][a-zA-Z0-9.-]{0,40}$/.test(event)) return;
  const clean = {};
  for (const [k, v] of Object.entries(data && typeof data === "object" ? data : {}).slice(0, 12)) {
    if (/^[a-zA-Z]{1,24}$/.test(k) && (typeof v === "number" || typeof v === "boolean" || (typeof v === "string" && v.length <= 40))) clean[k] = v;
  }
  mark(`ui.${event}`, clean);
}

module.exports = { on, mark, flush, fromRenderer };

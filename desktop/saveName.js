/**
 * 세이브파일 이름 규칙 — **만드는 쪽과 검사하는 쪽이 같은 것을 봐야 한다** (2026-08-28).
 *
 * ## 왜 파일로 뽑았나
 *
 * 규칙은 `main.js`에, 이름을 **만들어내는** 곳은 `backup.js`에 있었다. 서로를 모르니
 * 되돌리기가 `내 기록 2026-08-28_053012 (2)`를 만들었고, 괄호가 허용 문자에 없어서
 * **그 세이브파일은 열 수도 지울 수도 없었다** — `saves:remove`도 같은 검사를 지난다.
 * 탐색기로 직접 지우는 것 말고는 방법이 없는 상태가 된다.
 *
 * 사람이 입력한 이름은 `assert`로 **거절**하고, 우리가 조립한 이름은 `fit`으로 **다듬는다.**
 * 둘이 같은 상수를 보므로 이제 어긋날 수가 없다.
 */

/** 이름이 곧 파일명이다. 경로 구분자·OS 금지문자가 섞이면 saves/ 밖으로 나간다 */
const ALLOWED = /^[가-힣a-zA-Z0-9 _.-]+$/;
const MAX_LENGTH = 50;

/**
 * 윈도우가 **파일 이름으로 못 쓰는 이름들** (10단계 대비).
 *
 * 장치 이름이라 확장자를 붙여도 안 된다 — `CON.mv.db`도 거부된다. 맥에서는 아무 문제
 * 없이 만들어지므로 **여기서 안 막으면 윈도우에서만 터진다.** 지금 막는 게 싸다
 */
const RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])$/i;

function isValid(name) {
  return typeof name === "string"
    && name.length > 0
    && name.length <= MAX_LENGTH
    && ALLOWED.test(name)
    && !name.includes("..")
    // 끝의 공백·점은 윈도우가 조용히 잘라낸다 → 목록의 이름과 실제 파일이 어긋난다
    && !/[\s.]$/.test(name)
    && !RESERVED.test(name.split(".")[0]);
}

/** 사람이 입력한 이름. 규칙을 어기면 거절한다 — 조용히 고쳐주면 목록에서 못 찾는다 */
function assertSaveName(name) {
  const trimmed = (name ?? "").trim();
  if (!isValid(trimmed)) {
    throw new Error("이름은 한글·영문·숫자·공백·_-. 만 쓸 수 있습니다 (50자 이내)");
  }
  return trimmed;
}

/**
 * 우리가 조립한 이름을 규칙 안으로 밀어 넣는다 (되돌리기).
 *
 * `suffix`를 **따로 받는 게 요점이다.** 통째로 자르면 `... (2)`의 꼬리가 먼저 잘려나가
 * 충돌 회피가 무의미해진다. 꼬리 자리를 먼저 떼어두고 앞을 줄인다.
 *
 * 끝의 공백·점을 걷어내는 건 윈도우 대비다 — `이름 .mv.db`를 만들 수 없다
 */
function fit(base, suffix = "") {
  const cleaned = String(base).replace(/[^가-힣a-zA-Z0-9 _.-]+/g, "-").replace(/\.{2,}/g, ".");
  const room = Math.max(1, MAX_LENGTH - suffix.length);
  const head = cleaned.slice(0, room).replace(/[\s.]+$/, "") || "backup";
  const name = head + suffix;
  // 다듬고도 규칙을 어기면(예약어 등) 안전한 이름으로 물러난다. 조용히 못 쓰는 파일을 만드느니
  return isValid(name) ? name : `backup${suffix}`;
}

module.exports = { assertSaveName, isValid, fit, MAX_LENGTH };

/**
 * 썸네일 공장(숨긴 창)의 preload — 메인이 준 MessagePort를 페이지로 넘기기만 한다.
 * 다리(`window.starlog`)는 없다. 이 창은 그림을 푸는 일 말고는 아무것도 못 한다
 */
const { ipcRenderer } = require("electron");

ipcRenderer.on("thumb:port", (event) => {
  window.postMessage("thumb:port", "*", event.ports);
});

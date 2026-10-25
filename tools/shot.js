/**
 * 화면 확인 — 숨긴 창으로 열어 PNG로 찍고, 콘솔 오류·실패한 요청·화면 글자를 출력한다.
 *
 *   desktop/node_modules/.bin/electron tools/shot.js <주소|경로> <out.png> [옵션]
 *     경로만 주면 http://127.0.0.1:3000 기준 (tools/dev-up.sh가 띄운 개발 화면 — 127.0.0.1에만 열린다)
 *     --size 1440x900      창 크기 (좁은 창 확인: 380x800)
 *     --wait 1500          로드 뒤 기다릴 ms
 *     --eval "<js>"        찍기 전에 페이지에서 실행 (클릭·입력 등). 여러 번 줄 수 있고 차례로 돈다
 *     --text 400           화면 글자 앞부분 몇 자를 출력할지 (0이면 생략)
 * 창은 뜨지 않는다. 실제 데이터를 쓰는 개발 서버에 붙으니 --eval로 저장 버튼을 누르면 정말 저장된다.
 */
const { app, BrowserWindow, dialog } = require("electron");
// 실패가 사람 화면에 대화상자로 뜨지 않게 — 출력하고 종료 코드로 알린다
dialog.showErrorBox = (title, content) => console.error(`[error] ${title}: ${content}`);
process.on("uncaughtException", (e) => { console.error("[uncaught]", e?.stack ?? e); app.exit(1); });
const fs = require("fs");
const args = process.argv.slice(process.argv.findIndex((a) => a.endsWith("shot.js")) + 1);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const evals = args.flatMap((a, i) => (a === "--eval" ? [args[i + 1]] : []));
const [target, out] = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
if (!target || !out) { console.error("사용법: electron tools/shot.js <주소|경로> <out.png> [--size WxH] [--wait ms] [--eval js]…"); process.exit(2); }
const url = /^[a-z]+:\/\//.test(target) ? target : `http://127.0.0.1:3000${target.startsWith("/") ? "" : "/"}${target}`;
const [w, h] = opt("--size", "1440x900").split("x").map(Number);
const wait = Number(opt("--wait", "1500"));
const textLen = Number(opt("--text", "400"));
app.dock?.hide();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: w, height: h, webPreferences: { backgroundThrottling: false } });
  const logs = [];
  win.webContents.on("console-message", ({ level, message, lineNumber, sourceId }) => { if ((level === "warning" || level === "error") && !/Electron Security Warning/.test(message)) logs.push(`[console ${level === "error" ? "error" : "warn"}] ${message} (${sourceId}:${lineNumber})`); });
  win.webContents.on("render-process-gone", (_e, d) => logs.push(`[renderer gone] ${JSON.stringify(d)}`));
  win.webContents.session.webRequest.onCompleted((d) => { if (d.statusCode >= 400) logs.push(`[http ${d.statusCode}] ${d.method} ${d.url}`); });
  win.webContents.session.webRequest.onErrorOccurred((d) => { if (!/ERR_ABORTED/.test(d.error)) logs.push(`[net] ${d.error} ${d.url}`); });
  try { await win.loadURL(url); } catch (e) { logs.push(`[load] ${e.message}`); }
  await new Promise((r) => setTimeout(r, wait));
  for (const code of evals) {
    try { const r = await win.webContents.executeJavaScript(`(async () => { ${code} })()`, true); if (r !== undefined) console.log("eval →", JSON.stringify(r)); }
    catch (e) { logs.push(`[eval] ${e.message}`); }
    await new Promise((r) => setTimeout(r, 700));
  }
  // 찍다 던지면 예전엔 프로세스가 안 끝났다 — 이유를 남기고 1로 끝낸다
  try {
    fs.writeFileSync(out, (await win.webContents.capturePage()).toPNG());
  } catch (e) {
    console.error("[capture]", e?.message ?? e);
    app.exit(1);
    return;
  }
  if (textLen > 0) console.log("TEXT:", JSON.stringify((await win.webContents.executeJavaScript("document.body.innerText")).slice(0, textLen)));
  console.log(logs.length ? logs.slice(0, 40).join("\n") : "(콘솔 오류·실패 요청 없음)");
  console.log("→", out);
  app.quit();
});

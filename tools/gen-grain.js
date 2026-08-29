const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");
const OUT = process.argv[2];
const N = 192;   // 타일 한 변. 작으면 반복이 눈에 보이고, 크면 파일이 커진다

const html = `<!doctype html><meta charset="utf-8"><canvas id="c" width="${N}" height="${N}"></canvas>
<script>
window.make = () => {
  const c = document.getElementById("c");
  const g = c.getContext("2d");
  const img = g.createImageData(${N}, ${N});
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    // 흑백 노이즈를 알파로 흘린다 — 밝고 어두운 알갱이가 섞여야 필름 결이 된다
    const v = Math.random() * 255;
    d[i] = d[i+1] = d[i+2] = v;
    d[i+3] = 70 + Math.random() * 90;
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL("image/png");
};
</script>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: N, height: N, show: false, webPreferences: { offscreen: true } });
  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 400));
  const url = await win.webContents.executeJavaScript("window.make()");
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, "grain.png");
  fs.writeFileSync(file, Buffer.from(url.split(",")[1], "base64"));
  console.log("  grain.png", Math.round(fs.statSync(file).size / 1024) + "KB");
  app.quit();
});

const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const { vert, frag } = JSON.parse(fs.readFileSync(path.join(__dirname, "shaders.json"), "utf8"));
const tones = JSON.parse(fs.readFileSync(path.join(__dirname, "tones.json"), "utf8"));
const OUT = process.argv[2];
const SIZE = 512;

const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#000}</style>
<canvas id="c" width="${SIZE}" height="${SIZE}"></canvas>
<script>
const VERT = ${JSON.stringify(vert)};
const FRAG = ${JSON.stringify(frag)};
const hexToRgb = (h) => [1,3,5].map(i => parseInt(h.slice(i, i+2), 16) / 255);

function build(gl) {
  const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const p = gl.createProgram();
  gl.attachShader(p, mk(gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, mk(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

window.render = (colors, time) => {
  const c = document.getElementById("c");
  const gl = c.getContext("webgl", { preserveDrawingBuffer: true });
  const p = build(gl);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([1,1,-1,1,1,-1,-1,-1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(p, "aVertexPosition");
  gl.useProgram(p);
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.uniform1f(gl.getUniformLocation(p, "uTime"), time);
  gl.uniform2f(gl.getUniformLocation(p, "uResolution"), ${SIZE}, ${SIZE});
  gl.uniform1f(gl.getUniformLocation(p, "uAppState"), 0.0);
  const split = gl.getUniformLocation(p, "uSplit");
  if (split) gl.uniform1f(split, -1.0);
  ["colorA","colorB","colorC","colorD","colorE"].forEach((n, i) => {
    const u = gl.getUniformLocation(p, n);
    if (u) gl.uniform3fv(u, hexToRgb(colors[i]));
  });
  gl.viewport(0, 0, ${SIZE}, ${SIZE});
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  return c.toDataURL("image/jpeg", 0.86);
};
</script>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: SIZE, height: SIZE, show: false,
    webPreferences: { offscreen: true, nodeIntegration: false } });
  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 600));
  fs.mkdirSync(OUT, { recursive: true });

  for (const [name, palette] of Object.entries(tones)) {
    // 색마다 시간을 달리해 무늬가 겹치지 않게 한다 — 같은 시간이면 열넷이 판박이다
    const time = 3 + Object.keys(tones).indexOf(name) * 7.3;
    const url = await win.webContents.executeJavaScript(
      `window.render(${JSON.stringify(palette)}, ${time})`);
    fs.writeFileSync(path.join(OUT, name + ".jpg"),
      Buffer.from(url.split(",")[1], "base64"));
    console.log("  " + name, Math.round(fs.statSync(path.join(OUT, name + ".jpg")).size / 1024) + "KB");
  }
  app.quit();
});

/**
 * 화면 ↔ 일렉트론 사이의 유일한 통로 (architecture §2).
 *
 * ## 왜 이 파일이 필요한가
 *
 * `contextIsolation: true`라 렌더러(입구 화면)는 Node를 못 본다. 그건 끄면 안 되는
 * 안전장치다 — 끄는 순간 화면이 파일시스템을 통째로 만질 수 있게 된다.
 * 그래서 **딱 필요한 함수만 이름 붙여 건네준다.** 여기 없는 건 화면이 못 한다.
 *
 * ## 여기 있는 것들의 공통점
 *
 * 전부 **백엔드가 뜨기 전에** 필요한 일이다 (architecture §2의 경계표).
 * 기준은 "재시작이 필요한가"다 — DB·스토리지는 부팅 때 조립되므로 이쪽,
 * IGDB 키는 런타임에 바꿔도 되므로 앱 안(서버 API).
 *
 * ⚠️ **자격증명은 가린 채로 온다** (보안 점검 2026-10-25). 오타를 확인해야 하는 값이라(결정 63)
 * 눈 버튼은 그대로 있다 — 누를 때 `connections.reveal`로 그 칸 하나만 받아온다.
 *
 * ## 우리 문서에만 다리를 놓는다
 *
 * 메인이 창의 이동을 막지만 두 번째 울타리로, 지금 문서가 `app://starlog`나 `http://127.0.0.1:<지금 서버>`가
 * 아니면 `window.starlog`를 아예 만들지 않는다. 메인도 IPC마다 발신자를 다시 본다
 */
const { contextBridge, ipcRenderer, webUtils } = require("electron");

/*
 * 파일을 창 아무 데나 떨어뜨리면 크로미움이 그 파일로 **문서를 이동**한다. 끌어놓기 칸(`DropZone`)이
 * 처리하지 않은 것만 막는다 — 버블 단계라 칸이 먼저 받는다
 */
window.addEventListener("dragover", (event) => {
  if (event.defaultPrevented) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
});
window.addEventListener("drop", (event) => {
  if (!event.defaultPrevented) event.preventDefault();
});

function trustedOrigin() {
  const origin = location.origin;
  if (origin === "app://starlog") return true;
  const m = /^http:\/\/127\.0\.0\.1:(\d+)$/.exec(origin);
  // 포트까지 맞아야 한다 — 127.0.0.1의 다른 포트는 남의 프로그램일 수 있다
  return Boolean(m) && Number(m[1]) === ipcRenderer.sendSync("session:port");
}

/*
 * 마우스·휠을 만졌다 — 메인의 배경 일 문(`mediaGate.js`)이 "보이고 1분 안에 만짐"을 본다. 키보드는 메인이 직접 듣는다.
 * 5초에 한 번만 보낸다
 */
if (trustedOrigin()) {
  let lastActivity = 0;
  const activity = () => {
    const now = Date.now();
    if (now - lastActivity < 5000) return;
    lastActivity = now;
    ipcRenderer.send("media:activity");
  };
  window.addEventListener("pointerdown", activity, { capture: true, passive: true });
  window.addEventListener("wheel", activity, { capture: true, passive: true });
  window.addEventListener("pointermove", activity, { capture: true, passive: true });
}

if (trustedOrigin()) contextBridge.exposeInMainWorld("starlog", {
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    setDataRoot: (dir) => ipcRenderer.invoke("settings:setDataRoot", dir),
    /** 바꾸기 전에 살펴본다 — 쓸 수 있는 곳인지, 이미 우리 구조가 있는지 */
    inspectDataRoot: (dir) => ipcRenderer.invoke("settings:inspectDataRoot", dir),
    /** 로컬 세이브의 커버 위치 — "db" | "local". 다음에 세이브를 열 때부터 */
    setLocalCoverTarget: (value) => ipcRenderer.invoke("settings:setLocalCoverTarget", value),
  },
  /**
   * 배경 색 캐시 (프론트 F4). 입구가 백엔드 없이 마지막 색으로 뜨게 한다 (프리셋은 서버 프로필에 있다).
   * `get`은 동기 — 첫 프레임 전에 알아야 기본색이 번쩍이지 않는다
   */
  background: {
    get: () => ipcRenderer.sendSync("background:get"),
    set: (patch) => ipcRenderer.send("background:set", patch),
  },
  pickFolder: () => ipcRenderer.invoke("dialog:pickFolder"),
  openFolder: (which) => ipcRenderer.invoke("shell:openFolder", which),
  /** 스크린샷 폴더처럼 백엔드가 알려준 절대 경로를 연다. 데이터 루트 밖은 거부된다 */
  openPath: (target) => ipcRenderer.invoke("shell:openPath", target),

  saves: {
    list: () => ipcRenderer.invoke("saves:list"),
    create: (name) => ipcRenderer.invoke("saves:create", name),
    /** 이름 바꾸기 — 백업 폴더와 [최근 접속] 기록까지 함께 옮긴다 */
    rename: (from, to) => ipcRenderer.invoke("saves:rename", from, to),
    remove: (name) => ipcRenderer.invoke("saves:remove", name),
  },

  /**
   * 백업 (9단계). **로컬 모드 전용** — 클라우드는 복사할 파일이 아예 없다.
   *
   * `create`는 대상이 지금 열려 있는 세이브면 **서버를 내리고** 한다. 화면은 그걸 몰라도 되고,
   * 다만 그 뒤로 [최근 접속]이 즉시가 아니게 된다
   */
  backups: {
    usage: (saveName) => ipcRenderer.invoke("backups:usage", saveName),
    create: (saveName) => ipcRenderer.invoke("backups:create", saveName),
    restore: (saveName, fileName) => ipcRenderer.invoke("backups:restore", saveName, fileName),
    remove: (saveName, fileName) => ipcRenderer.invoke("backups:remove", saveName, fileName),
  },

  /**
   * 클라우드 데이터를 로컬 세이브파일로 뽑는다 (§6).
   * DB 커버는 바이트째 따라온다(형식 6). ⚠️ 로컬 폴더·스토리지 커버는 실물이 안 따라온다 — 마스터 커버로 폴백된다
   */
  cloudToSaveFile: (saveName) => ipcRenderer.invoke("cloud:toSaveFile", saveName),

  /**
   * 클라우드 백업 (2026-10-25) — 지금 연결의 `/api/me/export`를 `.json.gz`로. 대상은 **지금 세션**이다.
   * 자동(`auto/`, 하루 한 번·10개)과 수동(`manual/`, 안 지운다)은 폴더가 다르다
   */
  cloudBackups: {
    list: () => ipcRenderer.invoke("cloudBackups:list"),
    suggestName: () => ipcRenderer.invoke("cloudBackups:suggestName"),
    create: (name) => ipcRenderer.invoke("cloudBackups:create", name),
    /** 새 로컬 세이브로 푼다. `saveName`을 안 주면 일렉트론이 겹치지 않는 이름을 짓는다 */
    restore: (kind, fileName, saveName) => ipcRenderer.invoke("cloudBackups:restore", kind, fileName, saveName),
    remove: (kind, fileName) => ipcRenderer.invoke("cloudBackups:remove", kind, fileName),
    openFolder: (kind) => ipcRenderer.invoke("cloudBackups:openFolder", kind),
    /** 종류별 마지막 상태. 구독이 붙기 전에 쏜 것을 붙을 때 가져간다 */
    status: () => ipcRenderer.invoke("cloudBackups:status"),
    onStatus: (callback) => {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on("cloud-backup:status", handler);
      return () => ipcRenderer.removeListener("cloud-backup:status", handler);
    },
  },

  /**
   * 반대 방향 — 로컬 세이브파일을 지금 붙은 데이터베이스에 **덮어쓴다** (2026-08-28).
   *
   * ⚠️ 되돌릴 수 없다. 그래서 일렉트론이 **직전에 지금 데이터를 세이브파일로 뽑아둔다** —
   * 돌려주는 `safetySaveName`이 그것이다. 화면은 그 이름을 반드시 사람에게 보여줘야 한다
   */
  saveFileToCloud: (saveName) => ipcRenderer.invoke("saveFile:toCloud", saveName),

  /** 지금 붙어 있는 대상. `alive`면 [최근 접속]이 즉시 이동이다 */
  session: {
    current: () => ipcRenderer.invoke("session:current"),
    /** 살아 있는 백엔드로 되돌아간다. `{ port }`를 주면 화면이 알아서 들어간다 */
    resume: () => ipcRenderer.invoke("session:resume"),
    /**
     * 지금 서버의 API 토큰 (**동기**). 서버를 띄울 때마다 바뀐다 — `backendPort()`와 같이 갈아끼운다.
     * `lib/api.ts`가 `X-Starlog-Token`에 싣는다
     */
    token: () => ipcRenderer.sendSync("session:token"),
  },

  /**
   * 지금 백엔드의 포트. **동기다.**
   *
   * `lib/apiBase.ts`가 모듈을 처음 불러올 때 주소를 정해야 한다 — 그때 비동기로 물어보면
   * **첫 요청 몇 개가 주소 없이** 나간다. 값 하나 읽는 것뿐이라 동기로 두는 값이 싸다
   */
  backendPort: () => ipcRenderer.sendSync("session:port"),

  /**
   * "입구로 가라" — 백엔드가 혼자 죽었거나 앱 안에서 [나가기]를 눌렀을 때 온다.
   *
   * 예전엔 일렉트론이 문서를 통째로 다시 로드했다. 이제는 **알리기만** 하고 옮기는 건
   * 화면 라우터가 한다 — 그래야 배경도 알림도 안 끊긴다
   */
  onGoEntry: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("go-entry", handler);
    return () => ipcRenderer.removeListener("go-entry", handler);
  },

  connections: {
    list: () => ipcRenderer.invoke("connections:list"),
    /**
     * 가린 값(`••••abcd`)을 그대로 두면 저장된 진짜 값이 유지된다. 고치는 항목이면 `{ previousName }` —
     * 이름을 바꿨으면 그 항목을 제자리에서 바꾼다. 다른 연결과 이름이 겹치면 거절한다
     */
    save: (profile, options) => ipcRenderer.invoke("connections:save", profile, options),
    remove: (name) => ipcRenderer.invoke("connections:remove", name),
    /** 눈 버튼 — 칸 하나(`"db.password"` 등)의 진짜 값 */
    reveal: (name, field) => ipcRenderer.invoke("connections:reveal", name, field),
    /**
     * @param options `{ scope, previousName }`. `"all"`은 넷 다, `"db"`·`"storage"`는 그 하나만.
     *                DB는 열어 보기만 한다(스키마를 만들지 않는다)
     */
    test: (profile, options) => ipcRenderer.invoke("connections:test", profile, options),
  },

  /**
   * 스크린샷 관리자 (P6 S2). 파일은 **`{entryId, fileName}`으로만** 가리킨다 — 경로는 일렉트론이 서버에 묻고
   * 데이터 루트의 `media/` 안인지 다시 본다. 본 앱(`app://starlog`)에서만 된다
   */
  media: {
    /**
     * 클립보드로. `{entryId, fileName}` 하나 또는 그 배열(최대 500).
     * 하나면 사진은 그림으로(`as: "image"`), WebP·영상은 파일 참조로(`as: "file"`). **둘 이상이면 전부 파일 참조**.
     * 하나라도 못 찾으면 아무것도 복사하지 않는다
     * @returns `{ ok: true, as, count }` | `{ ok: false, reason: "NOT_FOUND", failed: [{entryId, fileName}] }` | `{ ok: false, reason: "UNSUPPORTED" }`
     */
    copy: (target) => ipcRenderer.invoke("media:copy", target),
    /**
     * 폴더를 **매번** 골라 복사한다. 이름이 겹치면 `001 (1).png`. 덮어쓰지 않는다
     * @returns `{ canceled: true }` | `{ canceled: false, folder, saved: [{entryId, fileName, savedAs}], failed: [{entryId, fileName, reason}] }`
     */
    saveTo: (refs) => ipcRenderer.invoke("media:saveTo", refs),
    /** 배경 썸네일 진행 `{phase, done, total}` (mediaWork.js) */
    onProgress: (callback) => {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on("media:progress", handler);
      return () => ipcRenderer.removeListener("media:progress", handler);
    },
    /** 게임 폴더가 바뀌었다 (fs.watch) */
    onChanged: (callback) => {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on("media:changed", handler);
      return () => ipcRenderer.removeListener("media:changed", handler);
    },
    cancelPrepare: () => ipcRenderer.invoke("media:cancelPrepare"),
    /** 끌어놓은 `File`의 실제 경로. 클립보드·Blob이면 null — 그건 HTTP 길로 간다 */
    pathOf: (file) => {
      try { return webUtils.getPathForFile(file) || null; } catch { return null; }
    },
    /** 경로로 넣기 — 메인이 복사·검증·커밋한다. 바로 `{batchId}`를 주고 상태는 `onIngest`·`ingestStatus`로 */
    ingest: (req) => ipcRenderer.invoke("media:ingest", req),
    ingestStatus: () => ipcRenderer.invoke("media:ingestStatus"),
    onIngest: (callback) => {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on("media:ingest", handler);
      return () => ipcRenderer.removeListener("media:ingest", handler);
    },
    driveInfo: () => ipcRenderer.invoke("media:driveInfo"),
    setDriveLabel: (label) => ipcRenderer.invoke("media:setDriveLabel", label),
    timingOn: () => ipcRenderer.sendSync("media:timingOn") === true,
    timing: (event, data) => ipcRenderer.send("media:timing", event, data),
  },

  /**
   * 외부 스크린샷 폴더 (스팀·ShareX …) — 이 PC에 등록해 두고 보다가 STARLOG로 옮긴다. **경로는 화면이 못 정한다**:
   * `add`는 일렉트론이 네이티브 폴더 창을 띄운다. 파일은 `(sourceId, 상대 경로)`로만 가리킨다
   */
  sources: {
    list: () => ipcRenderer.invoke("sources:list"),
    /** `{kind: "steam"|"folder", name}` → `{canceled: true}` | `{canceled: false, source}` */
    add: (req) => ipcRenderer.invoke("sources:add", req),
    rename: (id, name) => ipcRenderer.invoke("sources:rename", id, name),
    remove: (id) => ipcRenderer.invoke("sources:remove", id),
    /** 한 폴더를 훑는다 — 묶음(스팀은 게임, 폴더는 하위 폴더)과 파일 목록 */
    scan: (id, firstKey) => ipcRenderer.invoke("sources:scan", id, firstKey),
    /** 탐색기로 열기 — 묶음 키(스팀 appid · 하위 폴더 상대 경로, 폴더 바로 아래는 "")로 메인이 폴더를 찾는다 */
    reveal: (id, groupKey) => ipcRenderer.invoke("sources:reveal", id, groupKey),
    /** `{appid: entryId}` — 이 PC에서 마지막으로 그 appid를 옮긴 게임 */
    memory: () => ipcRenderer.invoke("sources:memory"),
    /** 옛 appid → 게임 기억을 서버 연결 표로 옮겼다 — 이후 memory()는 빈 객체 */
    memoryMigrated: () => ipcRenderer.invoke("sources:memoryMigrated"),
    watch: () => ipcRenderer.invoke("sources:watch"),
    unwatch: () => ipcRenderer.invoke("sources:unwatch"),
    onChanged: (callback) => {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on("sources:changed", handler);
      return () => ipcRenderer.removeListener("sources:changed", handler);
    },
    /**
     * 옮기기 — 복사·검증·확정이 다 끝난 뒤에만 원본이 휴지통으로 간다. 진행은 `media.onIngest`(`mode: "move"`)
     * @param req `{sourceId, groupKey, rels: string[], entryId}`
     */
    move: (req) => ipcRenderer.invoke("inbox:move", req),
  },

  /**
   * 백엔드를 띄운다. 성공하면 `{ ok, port }` — 창은 안 옮기고 화면이 그 포트로 스스로 들어간다.
   * `{ resume: true }`면 [최근 접속]이다 — 없어진 세이브·연결은 새로 만들지 않고 거절한다
   */
  launch: (request) => ipcRenderer.invoke("launch", request),
  /** 기동 대기 중의 [취소]. 띄우던 서버를 내린다 */
  cancelLaunch: () => ipcRenderer.invoke("launch:cancel"),
  /** 앱 안에서 서버가 죽어 입구로 왔을 때의 이유 (한 번 가져가면 지워진다) */
  takeLaunchError: () => ipcRenderer.invoke("launch:takeError"),

  /**
   * 본 앱 → 입구로 되돌아간다. 메인은 `go-entry`를 알리기만 하고 옮기는 건 화면 라우터가 한다.
   *
   * ⚠️ **백엔드는 안 죽인다** (9단계). 그래야 [최근 접속]이 즉시 복귀다
   */
  backToEntry: () => ipcRenderer.invoke("backToEntry"),

  /**
   * 기동 진행 상황.
   *
   * 구독을 해제하는 함수를 돌려준다 — React의 `useEffect`가 정리 함수를 기대하고,
   * 안 주면 화면을 오갈 때마다 리스너가 쌓인다
   */
  onProgress: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("launch:progress", handler);
    return () => ipcRenderer.removeListener("launch:progress", handler);
  },
});

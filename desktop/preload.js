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
 * IGDB 키는 런타임에 바꿔도 되므로 앱 안(스프링 API).
 *
 * ⚠️ **DB 비번을 그대로 주고받는다.** 혼자 쓰는 앱이라 숨기는 값이 아니라
 * **오타를 확인해야 하는 값**이다 (결정 63). 화면에서 눈 버튼으로 보여준다.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("starlog", {
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    setDataRoot: (dir) => ipcRenderer.invoke("settings:setDataRoot", dir),
    /** 바꾸기 전에 살펴본다 — 쓸 수 있는 곳인지, 이미 우리 구조가 있는지 */
    inspectDataRoot: (dir) => ipcRenderer.invoke("settings:inspectDataRoot", dir),
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
   * ⚠️ 커버 실물은 안 따라온다 — 스토리지에 있다. 마스터 커버로 폴백된다
   */
  cloudToSaveFile: (saveName) => ipcRenderer.invoke("cloud:toSaveFile", saveName),

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
    resume: () => ipcRenderer.invoke("session:resume"),
  },

  connections: {
    list: () => ipcRenderer.invoke("connections:list"),
    save: (profile) => ipcRenderer.invoke("connections:save", profile),
    remove: (name) => ipcRenderer.invoke("connections:remove", name),
    test: (profile) => ipcRenderer.invoke("connections:test", profile),
  },

  /** 백엔드를 띄우고 진단까지 통과하면 창이 본 앱으로 넘어간다 */
  launch: (request) => ipcRenderer.invoke("launch", request),

  /**
   * 본 앱 → 입구로 되돌아간다. 창만 `app://`로 다시 로드한다.
   *
   * ⚠️ **백엔드는 안 죽인다** (9단계). 그래야 [최근 접속]이 즉시 복귀다
   *
   * 이 preload는 본 앱(`http://127.0.0.1:포트`)에도 붙는다 — 같은 창이니까.
   * 그래서 앱 안에서도 이 함수를 부를 수 있고, 그게 5단계의 모드 전환 전부다
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

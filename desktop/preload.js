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
  },
  pickFolder: () => ipcRenderer.invoke("dialog:pickFolder"),
  openFolder: (which) => ipcRenderer.invoke("shell:openFolder", which),

  saves: {
    list: () => ipcRenderer.invoke("saves:list"),
    create: (name) => ipcRenderer.invoke("saves:create", name),
    remove: (name) => ipcRenderer.invoke("saves:remove", name),
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
   * 본 앱 → 입구로 되돌아간다. 백엔드를 죽이고 창을 `app://`로 다시 로드한다.
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

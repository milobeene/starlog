"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorMessage } from "@/lib/api";
import { closeTask, putTask, updateTask } from "@/lib/tasks";
import {
  clearDraft,
  draftOrigin,
  keepSection,
  releaseSection,
  restoreDraft,
  type SectionKey,
} from "@/lib/connectionDraft";
import { diagnosticOf, getBridge, type ConnectionProfile } from "@/lib/desktop";

/**
 * 테스트를 시작한 자리.
 *
 * 앱 안이면 **연결 탭까지** 적어둔다 — `/system`만 기억하면 돌아왔을 때 첫 탭(사용량)이
 * 열려서 연결 설정을 다시 찾아 들어가야 한다. 입구는 화면이 하나라 경로만으로 충분하다
 */
function testOrigin() {
  if (typeof window === "undefined") return "/";
  const path = window.location.pathname;
  return path.startsWith("/system") ? "/system?tab=keys" : path;
}

const EMPTY: ConnectionProfile = {
  name: "",
  db: { url: "", user: "", password: "", schema: "" },
  storage: { endpoint: "", bucket: "", accessKey: "", secretKey: "", publicBaseUrl: "" },
  igdb: { clientId: "", clientSecret: "" },
  mediaTargets: { covers: false, screenshots: false },
};

/** 채워야 하는 칸들. 라벨 옆에 실제 키 이름을 함께 보여준다 */
const DB_FIELDS = ["url", "user", "password"] as const;
const STORAGE_FIELDS = ["endpoint", "bucket", "accessKey", "secretKey", "publicBaseUrl"] as const;
const IGDB_FIELDS = ["clientId", "clientSecret"] as const;

/**
 * 연결 폼의 값·검증·테스트·저장. 화면(`ConnectionDialog`)은 이걸 그리기만 한다.
 * `mode`는 어느 섹션이 보이는가를, `initial`은 이름이 곧 키인 저장소에서 어느 항목인가를 정한다
 */
export function useConnectionForm({
  initial,
  mode,
  onSaved,
}: {
  initial?: ConnectionProfile;
  mode: "cloud" | "local";
  onSaved: (profile: ConnectionProfile) => void;
}) {
  /*
   * **테스트가 도는 중에 나갔다 온 것만** 값을 되살린다 (2026-08-28).
   * 그냥 만지다 나간 것은 버리는 게 맞다 — "잘못 건드렸으니 나갔다 오면 되겠지"가
   * 자연스러운 기대인데, 아무거나 붙들고 있으면 그 기대가 깨진다
   */
  const [form, setForm] = useState<ConnectionProfile>(
    () => restoreDraft(initial?.name ?? "", { ...EMPTY, ...initial }),
  );
  /** 전체 테스트가 도는 중 (입구의 관문). 섹션별은 아래 `busy`가 따로 본다 */
  const [testing, setTesting] = useState(false);
  /**
   * 지금 무엇을 시험하거나 저장하고 있나.
   *
   * ⚠️ **하나만 두면 안 된다.** 섹션마다 따로 도는 게 이 화면의 요점이라,
   * IGDB를 시험하는 동안에도 번역 칸은 만질 수 있어야 한다
   */
  const [busy, setBusy] = useState<Partial<Record<SectionKey, "test" | "save">>>({});
  /** 섹션별 결과 한 줄. 자세한 건 알림이 들고 화면에는 요약만 남긴다 */
  const [partResult, setPartResult] = useState<
    Partial<Record<SectionKey, { ok: boolean; message: string }>>
  >({});
  /** 저장 가능 여부만 본다 — 보여주는 건 알림이 한다 */
  const [passed, setPassed] = useState(false);
  /** 비활성 버튼을 눌렀을 때 어디를 채워야 하는지 빨갛게 표시한다 */
  const [showGaps, setShowGaps] = useState(false);
  /*
   * ⚠️ **`location.href`를 쓰면 안 된다.** 문서를 통째로 다시 로드해서 알림과 초안이
   * 들어 있는 모듈 스토어가 날아간다 — 실제로 [설정으로]를 누르면 테스트에 쓴 값이 사라졌다.
   * 라우터는 같은 문서 안에서 화면만 바꾸므로 스토어가 산다
   */
  const router = useRouter();

  const patch = (next: Partial<ConnectionProfile>) => {
    setForm((f) => ({ ...f, ...next }));
    setPassed(false);   // 값이 바뀌면 옛 테스트 결과는 거짓말이 된다
  };
  const setDb = (p: Partial<ConnectionProfile["db"]>) =>
    patch({ db: { ...form.db, ...p } });
  const setStorage = (p: Partial<NonNullable<ConnectionProfile["storage"]>>) =>
    patch({ storage: { ...form.storage, ...p } });
  const setIgdb = (p: Partial<NonNullable<ConnectionProfile["igdb"]>>) =>
    patch({ igdb: { ...form.igdb, ...p } });
  const setTargets = (p: Partial<NonNullable<ConnectionProfile["mediaTargets"]>>) =>
    patch({ mediaTargets: { covers: false, screenshots: false, ...form.mediaTargets, ...p } });

  const gaps = useMemo(() => {
    const missing: string[] = [];
    if (!form.name.trim()) missing.push("name");
    DB_FIELDS.forEach((k) => {
      // 비밀번호는 빈 값이 정당할 수 있다 — 주소와 사용자만 필수로 본다
      if (k !== "password" && !form.db[k]?.trim()) missing.push(`db.${k}`);
    });

    const storageFilled = STORAGE_FIELDS.filter((k) => form.storage?.[k]?.trim());
    if (storageFilled.length > 0) {
      STORAGE_FIELDS.forEach((k) => {
        if (!form.storage?.[k]?.trim()) missing.push(`storage.${k}`);
      });
    }
    const igdbFilled = IGDB_FIELDS.filter((k) => form.igdb?.[k]?.trim());
    if (igdbFilled.length > 0) {
      IGDB_FIELDS.forEach((k) => {
        if (!form.igdb?.[k]?.trim()) missing.push(`igdb.${k}`);
      });
    }
    return missing;
  }, [form]);

  const storageReady = STORAGE_FIELDS.every((k) => form.storage?.[k]?.trim());
  const canTest = gaps.length === 0;
  const canSave = canTest && passed;

  /**
   * 연결 테스트.
   *
   * **결과를 알림으로도 보낸다** (2026-08-28). 이 폼을 닫거나 다른 화면으로 가도 테스트는
   * 계속 도는데, 예전엔 결과를 받을 곳이 사라져서 **아무 일도 없었던 것처럼** 보였다.
   * 알림은 라우팅을 넘어 살아남고 닫기 전엔 안 사라진다
   */
  const test = async () => {
    if (!canTest) {
      setShowGaps(true);
      return;
    }
    setTesting(true);
    setPassed(false);
    /*
     * **지금 값을 붙들어둔다.** 20초쯤 걸리고 그동안 다른 화면에 갈 수 있는데,
     * 돌아왔을 때 방금 친 값이 사라지면 통과해놓고 저장할 게 없어진다
     */
    /* 전체 테스트는 네 섹션을 다 붙든다 — 전부 시험 중이니 전부 되살아나야 한다 */
    activeSections.forEach((k) =>
      keepSection(k, form[k], { name: form.name, originalName: initial?.name ?? form.name },
        testOrigin()));
    putTask({
      id: "connection-test",
      kind: "connection-test",
      title: `${form.name || "연결"} 확인 중`,
      progress: { done: 0, total: 0 },
    });

    try {
      /*
       * ⚠️ **앱 안에서는 DB·스토리지만 본다** (2026-08-28).
       *
       * 입구는 관문이라 한 번에 다 확인하는 게 맞지만, 앱 안은 "방금 고친 이 값이 맞나"라
       * 안 고친 것까지 부르면 느리고 결과가 다시 네 줄이라 좁혀지지 않는다.
       * IGDB·번역은 아래 각자 버튼이 맡는다 — 그 둘은 지금 백엔드에 값을 넘겨 바로
       * 시험할 수 있어서 시험용 백엔드를 띄울 필요가 없다
       */
      const found = await getBridge()!.connections.test(form, { scope: "all" });
      setPassed(found.ok);
      const origin = draftOrigin();
      updateTask("connection-test", {
        title: `${form.name || "연결"} — ${found.ok ? "연결됨" : "연결 실패"}`,
        progress: undefined,
        /*
         * 결과를 본 다음이 진짜 목적이다 — 통과했으면 저장, 아니면 고치러 돌아가기.
         * 알림에서 바로 못 하면 "어디서 눌렀더라"를 되짚어 찾아가야 한다
         */
        actions: [
          ...(found.ok
            ? [{
                label: "저장",
                primary: true,
                run: async () => {
                  await getBridge()!.connections.save(form);
                  clearDraft();
                  closeTask("connection-test");
                  onSaved(form);
                },
              }]
            : []),
          ...(origin && origin !== testOrigin()
            ? [{ label: "설정으로", run: () => router.push(origin) }]
            : []),
        ],
        result: {
          ok: found.ok,
          lines: [
            {
              ok: Boolean(found.database?.ok),
              label: "데이터베이스",
              detail: found.database?.ok ? "연결됨" : diagnosticOf(found.code).title,
            },
            ...(found.storage
              ? [{
                  ok: found.storage.ok,
                  label: "커버 스토리지",
                  detail: found.storage.message ?? (found.storage.ok ? "버킷에 접근했습니다" : ""),
                }]
              : []),
            ...(found.translate
              ? [{ ok: found.translate.ok, label: "번역", detail: found.translate.message ?? "" }]
              : []),
            ...(found.igdb
              ? [{ ok: found.igdb.ok, label: "IGDB", detail: found.igdb.message ?? "" }]
              : []),
          ],
        },
      });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    if (!canSave) {
      setShowGaps(true);
      return;
    }
    await getBridge()!.connections.save(form);
    clearDraft();
    closeTask("connection-test");
    onSaved(form);
  };

  /** 이 모드에서 실제로 보이는 섹션들. 전체 테스트·저장이 이것만 훑는다 */
  const activeSections: SectionKey[] =
    mode === "local" ? ["igdb", "translate"] : ["db", "storage", "igdb", "translate"];

  const bad = (key: string) => showGaps && gaps.includes(key);

  /**
   * 항목 하나만 확인한다 (앱 안 전용, 2026-08-28).
   *
   * IGDB와 번역은 **지금 백엔드에 값을 넘겨 바로 시험**할 수 있다 — 부팅 때 조립되는
   * DB·스토리지와 달리 런타임 값이라 시험용 백엔드가 필요 없다. 그래서 각자 버튼을 갖는다.
   *
   * ⚠️ **번역 확인은 글자를 한 자도 안 쓴다** — 백엔드가 `languages`(지원 언어 목록)를
   * 부른다. 값이 매겨지는 건 번역하려고 보낸 글자인데 그 호출엔 보낼 글자가 없다
   */
  /** 섹션마다 무엇을 부르나. DB·스토리지는 시험용 백엔드가 필요하고 나머지는 아니다 */
  const SECTION_LABEL: Record<SectionKey, string> = {
    db: "데이터베이스",
    storage: "커버 스토리지",
    igdb: "IGDB",
    translate: "번역",
  };

  /**
   * 섹션 하나만 시험한다 (2026-08-28).
   *
   * ## 왜 따로인가
   *
   * 전부 한 번에 돌리면 **어디가 틀렸는지 좁혀지지 않는다** — 고치려고 누른 건데
   * 결과가 다시 네 줄이다. 게다가 안 고친 것까지 부르니 느리고, IGDB·번역은
   * 남의 API 한도를 괜히 깎는다.
   *
   * ## 붙드는 것도 섹션 단위다
   *
   * 시험이 도는 동안 다른 화면에 다녀올 수 있는데, 그때 **시험 중인 섹션만** 값을
   * 되살린다. 그냥 만지다 나간 칸까지 붙들면 "나갔다 오면 원래대로"라는 기대가 깨진다
   */
  const testSection = async (key: SectionKey) => {
    setBusy((b) => ({ ...b, [key]: "test" }));
    setPartResult((r) => ({ ...r, [key]: undefined }));
    keepSection(key, form[key], { name: form.name, originalName: initial?.name ?? form.name },
      testOrigin());

    const id = `conn:${key}`;
    putTask({
      id,
      kind: "connection-test",
      title: `${SECTION_LABEL[key]} 확인 중`,
      progress: { done: 0, total: 0 },
    });

    try {
      const found = await runSectionTest(key);
      setPartResult((r) => ({ ...r, [key]: found }));

      const origin = draftOrigin();
      updateTask(id, {
        title: `${SECTION_LABEL[key]} — ${found.ok ? "확인됨" : "실패"}`,
        progress: undefined,
        /* 결과를 본 다음이 진짜 목적이다 — 되면 저장, 아니면 고치러 돌아가기 */
        actions: [
          ...(found.ok
            ? [{ label: "저장", primary: true, run: () => void saveSection(key, id) }]
            : []),
          ...(origin && origin !== testOrigin()
            ? [{ label: "설정으로", run: () => router.push(origin) }]
            : []),
        ],
        result: { ok: found.ok, message: found.message },
      });
    } finally {
      setBusy((b) => ({ ...b, [key]: undefined }));
    }
  };

  /**
   * ⚠️ **DB·스토리지와 IGDB·번역은 부르는 데가 다르다.**
   *
   * 앞의 둘은 **부팅 때 조립되는 값**이라 지금 백엔드로는 못 시험한다 — 시험용을 하나 띄워야
   * 하고, 그게 일렉트론의 `connections.test`다. 스토리지는 그 시험용을 **메모리 DB로**
   * 띄워서 사용자의 DB가 틀려도 스토리지만 볼 수 있게 했다.
   *
   * 뒤의 둘은 런타임 값이라 지금 백엔드에 넘기면 바로 답이 온다.
   * ⚠️ 번역 확인은 `languages`를 부르므로 **글자를 한 자도 안 쓴다**
   */
  const runSectionTest = async (
    key: SectionKey,
  ): Promise<{ ok: boolean; message: string }> => {
    try {
      if (key === "db" || key === "storage") {
        const found = await getBridge()!.connections.test(form, { scope: key });
        if (key === "db") {
          return {
            ok: Boolean(found.database?.ok),
            message: found.database?.ok ? "연결됐습니다" : diagnosticOf(found.code).title,
          };
        }
        return {
          ok: Boolean(found.storage?.ok),
          message: found.storage?.message ?? (found.storage?.ok ? "버킷에 접근했습니다" : "확인하지 못했습니다"),
        };
      }

      const path = key === "igdb"
        ? "/api/system/settings/igdb/test"
        : "/api/system/settings/translate/test";
      const body = key === "igdb"
        ? { clientId: form.igdb?.clientId ?? "", clientSecret: form.igdb?.clientSecret ?? "" }
        : { apiKey: form.translate?.apiKey ?? "" };
      const found = await api.post<{ ok: boolean; message: string }>(path, body);
      return { ok: found.ok, message: found.message };
    } catch (caught) {
      return { ok: false, message: errorMessage(caught, "확인하지 못했습니다.") };
    }
  };

  /**
   * 섹션 하나만 저장한다.
   *
   * ⚠️ **저장된 것 위에 이 섹션만 얹는다.** 화면의 `form`을 통째로 저장하면 다른 섹션에서
   * 만지다 만 값까지 함께 들어간다 — "테스트 안 한 건 리셋"이라는 규칙과 정면으로 어긋난다
   */
  const saveSection = async (key: SectionKey, taskId?: string) => {
    setBusy((b) => ({ ...b, [key]: "save" }));
    try {
      /*
       * ⚠️ **로컬은 connections.json이 없다.** IGDB·번역은 어차피 `app_setting`(DB)에
       * 사는 값이라 백엔드로 바로 보낸다 — 경계는 "재시작이 필요한가"다(architecture §2)
       */
      if (mode === "local") {
        if (key === "igdb") {
          await api.put("/api/system/settings/igdb", {
            clientId: form.igdb?.clientId ?? "",
            clientSecret: form.igdb?.clientSecret ?? "",
          });
        } else if (key === "translate") {
          await api.put("/api/system/settings/translate", {
            apiKey: form.translate?.apiKey ?? "",
          });
        }
        releaseSection(key);
        if (taskId) closeTask(taskId);
        setPartResult((r) => ({ ...r, [key]: { ok: true, message: "저장했습니다" } }));
        return;
      }

      const stored = (await getBridge()!.connections.list())
        .find((p) => p.name === (initial?.name ?? form.name));
      const base: ConnectionProfile = stored ?? { ...EMPTY, ...initial, name: form.name };

      const next: ConnectionProfile = { ...base, name: form.name };
      (next as unknown as Record<string, unknown>)[key] = form[key];
      /* 무엇을 올릴지(체크박스)는 스토리지 칸과 한 몸이다 — 따로 저장하면 짝이 안 맞는다 */
      if (key === "storage") next.mediaTargets = form.mediaTargets;

      /* 이름을 바꿨으면 옛 항목이 남는다 — 이름이 곧 키라서 지워줘야 둘이 안 생긴다 */
      if (stored && stored.name !== form.name) {
        await getBridge()!.connections.remove(stored.name);
      }

      await getBridge()!.connections.save(next);
      releaseSection(key);
      if (taskId) closeTask(taskId);
      setPartResult((r) => ({ ...r, [key]: { ok: true, message: "저장했습니다" } }));
      onSaved(next);
    } catch (caught) {
      setPartResult((r) => ({
        ...r,
        [key]: { ok: false, message: errorMessage(caught, "저장하지 못했습니다.") },
      }));
    } finally {
      setBusy((b) => ({ ...b, [key]: undefined }));
    }
  };

  return {
    form,
    patch,
    setDb,
    setStorage,
    setIgdb,
    setTargets,
    testing,
    busy,
    partResult,
    showGaps,
    gaps,
    storageReady,
    canTest,
    canSave,
    bad,
    test,
    save,
    testSection,
    saveSection,
  };
}

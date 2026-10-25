"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { closeTask, putTask, updateTask } from "@/lib/tasks";
import {
  clearDraft,
  consumeSettled,
  draftOrigin,
  keepSection,
  releaseSection,
  restoreDraft,
  settleSection,
  type SectionKey,
} from "@/lib/connectionDraft";
import { bridgeMessage, diagnosticOf, getBridge, type ConnectionProfile, type CoverTarget, type SecretFieldPath } from "@/lib/desktop";

function getAt(profile: ConnectionProfile | undefined, path: SecretFieldPath): string {
  const [group, key] = path.split(".");
  const section = (profile as unknown as Record<string, Record<string, unknown> | undefined> | undefined)?.[group];
  const value = section?.[key];
  return typeof value === "string" ? value : "";
}

function setAt(profile: ConnectionProfile, path: SecretFieldPath, value: string): ConnectionProfile {
  const [group, key] = path.split(".");
  const record = profile as unknown as Record<string, Record<string, unknown> | undefined>;
  return { ...profile, [group]: { ...(record[group] ?? {}), [key]: value } } as ConnectionProfile;
}

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
  coverTarget: "db",
};

/** 채워야 하는 칸들. 라벨 옆에 실제 키 이름을 함께 보여준다 */
const STORAGE_FIELDS = ["endpoint", "bucket", "accessKey", "secretKey", "publicBaseUrl"] as const;
const IGDB_FIELDS = ["clientId", "clientSecret"] as const;

/**
 * 섹션 하나의 빈칸. 전체 저장과 **섹션 저장이 같은 규칙**을 본다 (2026-10-25) —
 * 섹션 [저장]만 이 검사를 건너뛰어 스토리지 칸 일부만 찬 채로 저장됐다
 */
function sectionGaps(form: ConnectionProfile, key: SectionKey): string[] {
  const missing: string[] = [];
  if (key === "db") {
    // 비밀번호는 빈 값이 정당할 수 있다 — 주소와 사용자만 필수로 본다
    if (!form.db.url?.trim()) missing.push("db.url");
    if (!form.db.user?.trim()) missing.push("db.user");
  } else if (key === "storage") {
    if (STORAGE_FIELDS.some((k) => form.storage?.[k]?.trim())) {
      STORAGE_FIELDS.forEach((k) => {
        if (!form.storage?.[k]?.trim()) missing.push(`storage.${k}`);
      });
    }
  } else if (key === "igdb") {
    if (IGDB_FIELDS.some((k) => form.igdb?.[k]?.trim())) {
      IGDB_FIELDS.forEach((k) => {
        if (!form.igdb?.[k]?.trim()) missing.push(`igdb.${k}`);
      });
    }
  }
  return missing;
}

/**
 * 연결 폼의 값·검증·테스트·저장. 화면(`ConnectionDialog`)은 이걸 그리기만 한다.
 * `mode`는 어느 섹션이 보이는가를, `initial`은 이름이 곧 키인 저장소에서 어느 항목인가를 정한다
 */
export function useConnectionForm({
  initial,
  mode,
  onSaved,
  reveal,
}: {
  initial?: ConnectionProfile;
  mode: "cloud" | "local";
  onSaved: (profile: ConnectionProfile) => void;
  /**
   * 눈 버튼이 진짜 값을 받아 오는 곳. 없으면 저장된 연결(`connections.reveal`)에서.
   * 로컬 세이브는 연결 설정이 없어 서버(`app_setting`)에서 받는다
   */
  reveal?: (path: SecretFieldPath) => Promise<string | null>;
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
  /** 전체 테스트·저장이 던진 오류. 예전엔 삼켜져서 눌러도 아무 일이 없는 것처럼 보였다 */
  const [formError, setFormError] = useState<string | null>(null);
  /**
   * 폼이 아직 화면에 있나. 테스트가 끝났을 때 **보고 있으면** 붙든 값을 바로 놓는다 —
   * 화면에 값이 그대로 있으니 붙들 이유가 없고, 안 놓으면 비밀 값이 모듈에 계속 남는다
   */
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    consumeSettled();
    return () => {
      mounted.current = false;
    };
  }, []);
  /*
   * ⚠️ **`location.href`를 쓰면 안 된다.** 문서를 통째로 다시 로드해서 알림과 초안이
   * 들어 있는 모듈 스토어가 날아간다 — 실제로 [설정으로]를 누르면 테스트에 쓴 값이 사라졌다.
   * 라우터는 같은 문서 안에서 화면만 바꾸므로 스토어가 산다
   */
  const router = useRouter();

  const patch = (next: Partial<ConnectionProfile>) => {
    setForm((f) => ({ ...f, ...next }));
    setPassed(false);   // 값이 바뀌면 옛 테스트 결과는 거짓말이 된다
    setFormError(null);
  };
  const setDb = (p: Partial<ConnectionProfile["db"]>) =>
    patch({ db: { ...form.db, ...p } });
  const setStorage = (p: Partial<NonNullable<ConnectionProfile["storage"]>>) =>
    patch({ storage: { ...form.storage, ...p } });
  const setIgdb = (p: Partial<NonNullable<ConnectionProfile["igdb"]>>) =>
    patch({ igdb: { ...form.igdb, ...p } });
  const setCoverTarget = (coverTarget: CoverTarget) => patch({ coverTarget });

  /** 이 모드에서 실제로 보이는 섹션들. 전체 테스트·저장이 이것만 훑는다 */
  const activeSections: SectionKey[] =
    mode === "local" ? ["igdb", "translate"] : ["db", "storage", "igdb", "translate"];

  /*
   * ⚠️ **보이는 칸만 검사한다** (2026-10-25). 로컬에는 이름·DB 칸이 없는데 그걸 필수로 봐서
   * 하단 [전체 테스트]·[저장]이 영원히 "필수 항목을 채워 주세요"로 죽어 있었다
   */
  const gaps = useMemo(() => {
    const missing: string[] = [];
    if (mode === "cloud" && !form.name.trim()) missing.push("name");
    const shown: SectionKey[] = mode === "local" ? ["igdb", "translate"] : ["db", "storage", "igdb", "translate"];
    for (const key of shown) missing.push(...sectionGaps(form, key));
    return missing;
  }, [form, mode]);

  const storageReady = STORAGE_FIELDS.every((k) => form.storage?.[k]?.trim());

  /*
   * ## 비밀 칸은 가린 채로 온다 (보안 점검 2026-10-25)
   *
   * 목록이 주는 값은 `••••abcd`다. **안 고쳤으면(처음 받은 가린 값 그대로면)** 일렉트론이 저장·테스트 때
   * 진짜 값으로 바꿔 쓴다. 눈 버튼을 누르면 그 칸 하나만 받아와 폼에 채운다 — 그 뒤로는 예전과 같다
   */
  const storedName = initial?.name ?? "";
  const isMasked = (path: SecretFieldPath) =>
    Boolean(initial?.hasSecret?.[path]) && getAt(form, path) === getAt(initial, path);
  const fetchSecret = async (path: SecretFieldPath) => {
    if (reveal) return reveal(path);
    const fromConnections = getBridge()?.connections.reveal;
    if (!fromConnections || !storedName) return null;
    return fromConnections(storedName, path);
  };
  /** 눈 버튼. 값만 진짜로 바꾼다 — 같은 값이라 테스트 통과 여부는 그대로 둔다 */
  const revealSecret = async (path: SecretFieldPath) => {
    if (!isMasked(path)) return;
    const real = await fetchSecret(path);
    // 못 받았으면 던진다 — 조용히 넘어가면 눈 버튼이 가린 점(••••)을 "보여 준" 것처럼 된다
    if (real === null) throw new Error("저장된 값을 불러오지 못했습니다");
    setForm((f) => setAt(f, path, real));
  };
  const secretProps = (path: SecretFieldPath) => ({
    masked: isMasked(path),
    onReveal: () => revealSecret(path),
  });
  /**
   * 서버에 직접 넘길 값 (앱 안의 IGDB·번역 확인) — 가린 값이면 진짜 값을 받아 쓴다.
   * 로컬은 그 값이 **서버의 것**이라 가린 채로 보내도 서버가 저장된 원문으로 바꿔 쓴다 — 원문을 화면에 안 들인다
   */
  const plainValue = async (path: SecretFieldPath) =>
    mode === "cloud" && isMasked(path) ? ((await fetchSecret(path)) ?? "") : getAt(form, path);
  const previous = storedName ? { previousName: storedName } : {};
  const canTest = gaps.length === 0;
  const canSave = canTest && passed;

  /**
   * 테스트가 끝난 섹션의 붙든 값. 폼을 **보고 있으면** 바로 놓고, 떠나 있었으면 다음에 열 때 한 번만 되살린다 —
   * 예전엔 저장하지 않고 알림을 닫으면 붙든 값이 모듈에 계속 남아 같은 폼을 열 때마다 옛 값이 되살아났다
   */
  const settle = (key: SectionKey) => {
    if (mounted.current) releaseSection(key);
    else settleSection(key);
  };

  /** 저장 결과 목록에서 방금 저장한 것을 찾는다 — 잠김 표시 같은 메인의 판정을 화면이 그대로 받는다 */
  const savedOf = (list: ConnectionProfile[] | undefined, fallback: ConnectionProfile) =>
    list?.find((p) => p.name === fallback.name.trim()) ?? fallback;

  /**
   * 클라우드 전체 저장. 이름을 바꿨으면 일렉트론이 `previousName` 항목을 **제자리에서** 바꾼다 —
   * 예전엔 새로 저장하고 옛 것을 따로 지웠는데, 겹치는 이름이면 남의 연결을 덮어썼다
   */
  const saveWhole = async () => {
    const list = await getBridge()!.connections.save(form, previous);
    clearDraft();
    closeTask("connection-test");
    onSaved(savedOf(list, form));
  };

  /**
   * 연결 테스트.
   *
   * **결과를 알림으로도 보낸다** (2026-08-28). 이 폼을 닫거나 다른 화면으로 가도 테스트는
   * 계속 도는데, 예전엔 결과를 받을 곳이 사라져서 **아무 일도 없었던 것처럼** 보였다.
   * 알림은 라우팅을 넘어 살아남고, 실패도 알림을 닫힌 상태(결과)로 끝낸다
   */
  const test = async () => {
    if (!canTest) {
      setShowGaps(true);
      return;
    }
    setFormError(null);
    /*
     * 로컬은 시험용 서버가 필요 없다 — IGDB·번역은 지금 서버로 섹션마다 본다.
     * 채운 섹션만 시험하고, 하나도 안 채웠으면 시험할 게 없으니 통과다
     */
    if (mode === "local") {
      setTesting(true);
      setPassed(false);
      try {
        const filled = activeSections.filter((k) => sectionFilled(k));
        const results = [];
        for (const key of filled) results.push(await testSection(key));
        setPassed(results.every((r) => r.ok));
      } finally {
        setTesting(false);
      }
      return;
    }

    setTesting(true);
    setPassed(false);
    /*
     * **지금 값을 붙들어둔다.** 20초쯤 걸리고 그동안 다른 화면에 갈 수 있는데,
     * 돌아왔을 때 방금 친 값이 사라지면 통과해놓고 저장할 게 없어진다.
     * 전체 테스트는 네 섹션을 다 붙든다 — 전부 시험 중이니 전부 되살아나야 한다
     */
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
      // 입구도 앱 안도 넷 다 본다 — DB는 열어 보기만 하고, 나머지는 메모리 DB 시험용으로 본다
      const found = await getBridge()!.connections.test(form, { scope: "all", ...previous });
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
                run: () => {
                  saveWhole().catch((caught) => {
                    updateTask("connection-test", {
                      actions: [],
                      result: { ok: false, message: bridgeMessage(caught, "저장하지 못했습니다.") },
                    });
                  });
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
    } catch (caught) {
      const message = bridgeMessage(caught, "확인하지 못했습니다.");
      if (mounted.current) setFormError(message);
      updateTask("connection-test", {
        title: `${form.name || "연결"} — 확인 실패`,
        progress: undefined,
        result: { ok: false, message },
      });
    } finally {
      activeSections.forEach(settle);
      setTesting(false);
    }
  };

  const save = async () => {
    if (!canSave) {
      setShowGaps(true);
      return;
    }
    setFormError(null);
    try {
      if (mode === "local") {
        // 로컬은 섹션마다 서버(`app_setting`)에 넣는다 — 하나라도 실패하면 거기서 멈추고 알린다
        for (const key of activeSections) {
          const done = await saveSection(key);
          if (!done) throw new Error(`${SECTION_LABEL[key]}을(를) 저장하지 못했습니다`);
        }
        return;
      }
      await saveWhole();
    } catch (caught) {
      setFormError(bridgeMessage(caught, "저장하지 못했습니다."));
    }
  };

  /** 이 섹션에 시험할 값이 있나 (로컬 전체 테스트가 빈 섹션은 건너뛴다) */
  const sectionFilled = (key: SectionKey) =>
    key === "igdb"
      ? Boolean(form.igdb?.clientId?.trim() && form.igdb?.clientSecret?.trim())
      : key === "translate"
        ? Boolean(form.translate?.apiKey?.trim())
        : true;

  const bad = (key: string) => showGaps && gaps.includes(key);

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
  const testSection = async (key: SectionKey): Promise<{ ok: boolean; message: string }> => {
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
      return found;
    } finally {
      settle(key);
      setBusy((b) => ({ ...b, [key]: undefined }));
    }
  };

  /**
   * ⚠️ **DB·스토리지와 IGDB·번역은 부르는 데가 다르다.**
   *
   * 앞의 둘은 **부팅 때 조립되는 값**이라 지금 백엔드로는 못 시험한다 — 시험용을 하나 띄워야
   * 하고, 그게 일렉트론의 `connections.test`다. DB는 열어 보기만 하고, 스토리지는 시험용을
   * **메모리 DB로** 띄워서 사용자의 DB가 틀려도 스토리지만 볼 수 있게 했다.
   *
   * 뒤의 둘은 런타임 값이라 지금 백엔드에 넘기면 바로 답이 온다.
   * ⚠️ 번역 확인은 `languages`를 부르므로 **글자를 한 자도 안 쓴다**
   */
  const runSectionTest = async (
    key: SectionKey,
  ): Promise<{ ok: boolean; message: string }> => {
    try {
      if (key === "db" || key === "storage") {
        const found = await getBridge()!.connections.test(form, { scope: key, ...previous });
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
        ? { clientId: form.igdb?.clientId ?? "", clientSecret: await plainValue("igdb.clientSecret") }
        : { apiKey: await plainValue("translate.apiKey") };
      const found = await api.post<{ ok: boolean; message: string }>(path, body);
      return { ok: found.ok, message: found.message };
    } catch (caught) {
      return { ok: false, message: bridgeMessage(caught, "확인하지 못했습니다.") };
    }
  };

  /**
   * 섹션 하나만 저장한다.
   *
   * ⚠️ **저장된 것 위에 이 섹션만 얹는다.** 화면의 `form`을 통째로 저장하면 다른 섹션에서
   * 만지다 만 값까지 함께 들어간다 — "테스트 안 한 건 리셋"이라는 규칙과 정면으로 어긋난다
   */
  const saveSection = async (key: SectionKey, taskId?: string): Promise<boolean> => {
    const missing = sectionGaps(form, key);
    if (missing.length > 0) {
      setShowGaps(true);
      setPartResult((r) => ({
        ...r,
        [key]: { ok: false, message: "빨갛게 표시된 칸을 채우거나, 쓰지 않으시려면 모두 비워 주세요" },
      }));
      if (taskId) updateTask(taskId, { actions: [], result: { ok: false, message: "빈칸이 있어 저장하지 않았습니다" } });
      return false;
    }
    setBusy((b) => ({ ...b, [key]: "save" }));
    try {
      /*
       * ⚠️ **로컬은 connections.json이 없다.** IGDB·번역은 어차피 `app_setting`(DB)에
       * 사는 값이라 백엔드로 바로 보낸다 — 경계는 "재시작이 필요한가"다(architecture §2).
       * 가린 값을 그대로 보내면 서버가 저장된 원문을 지킨다
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
        return true;
      }

      const stored = (await getBridge()!.connections.list())
        .find((p) => p.name === (initial?.name ?? form.name));
      const base: ConnectionProfile = stored ?? { ...EMPTY, ...initial, name: form.name };

      const next: ConnectionProfile = { ...base, name: form.name };
      (next as unknown as Record<string, unknown>)[key] = form[key];
      /* 커버 위치는 이 섹션(커버) 칸이다 — 스토리지를 고른 채 스토리지 칸만 따로 저장되면 짝이 안 맞는다 */
      if (key === "storage") next.coverTarget = form.coverTarget;

      // 이름을 바꿨으면 일렉트론이 옛 항목을 제자리에서 바꾼다 (가린 값도 옛 항목에서 푼다)
      const list = await getBridge()!.connections.save(next, stored?.name || storedName
        ? { previousName: stored?.name ?? storedName }
        : {});
      releaseSection(key);
      if (taskId) closeTask(taskId);
      setPartResult((r) => ({ ...r, [key]: { ok: true, message: "저장했습니다" } }));
      onSaved(savedOf(list, next));
      return true;
    } catch (caught) {
      const message = bridgeMessage(caught, "저장하지 못했습니다.");
      setPartResult((r) => ({ ...r, [key]: { ok: false, message } }));
      if (taskId) updateTask(taskId, { actions: [], result: { ok: false, message } });
      return false;
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
    setCoverTarget,
    testing,
    busy,
    partResult,
    showGaps,
    gaps,
    formError,
    storageReady,
    canTest,
    canSave,
    bad,
    test,
    save,
    testSection,
    saveSection,
    secretProps,
  };
}

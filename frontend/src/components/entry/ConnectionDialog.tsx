"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import SecretField from "./SecretField";
import { Button, FIELD_INPUT } from "@/components/ui/Field";
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
 * 데이터베이스 연결 한 벌 (2026-08-28에 팝업으로 다시 만듦).
 *
 * ## 왜 팝업인가
 *
 * 입구 안에 펼쳐 놓으니 **창보다 길어져서** 위아래가 잘렸다. 팝업이면 제목과 버튼이
 * 고정되고 가운데만 구른다 — 어디까지 왔는지, 뭘 눌러야 하는지가 늘 보인다.
 *
 * ## 저장은 연결 테스트를 통과해야 열린다
 *
 * 예전엔 아무거나 저장되고, 그걸로 접속하면 **빈 화면만 하염없이** 나왔다.
 * 실제로 그렇게 겪었다. 이제 테스트가 성공해야 저장이 열리고, 입력이 바뀌면 다시 닫힌다.
 *
 * ## 묶음은 전부 채우거나 전부 비우거나
 *
 * 스토리지·IGDB는 선택이지만 **반만 채운 것은 안 채운 것보다 나쁘다** — 조용히 실패하고
 * 원인이 안 보인다. 하나라도 채웠으면 나머지도 채우게 막는다
 */
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

export default function ConnectionDialog({
  initial,
  inline = false,
  notice = null,
  onClose,
  onSaved,
}: {
  initial?: ConnectionProfile;
  /**
   * 팝업이 아니라 자리에 그대로 편다 (앱 안의 연결 탭).
   *
   * 앱 안에서는 연결이 언제나 하나라 고르는 단계가 없고, 나가려면 탭을 옮기면 된다 —
   * **취소 버튼이 뜻을 잃는다.** 입구에서는 여러 개 중 하나를 고르므로 팝업이 맞다
   */
  inline?: boolean;
  /** 바깥에서 온 알림(저장 완료 등). 결과·진행과 **같은 자리**에 모아 보여준다 */
  notice?: string | null;
  onClose: () => void;
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
    (["db", "storage", "igdb", "translate"] as SectionKey[]).forEach((k) =>
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

  const bad = (key: string) => showGaps && gaps.includes(key);

  /**
   * 섹션마다 붙는 [테스트] · [저장] · 결과 한 줄.
   *
   * ⚠️ **입구에는 안 붙인다.** 입구는 백엔드가 뜨기 전이라 IGDB·번역을 부를 데가 없고,
   * 애초에 목적이 다르다 — 거기서는 "이 연결로 들어가도 되나"를 한 번에 보는 게 맞다
   */
  const Footer = ({ part, ready }: { part: SectionKey; ready: boolean }) => {
    if (!inline) return null;
    const state = busy[part];
    const found = partResult[part];
    return (
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Button onClick={() => testSection(part)} disabled={!ready || state !== undefined}>
          {state === "test" ? "확인 중…" : "테스트"}
        </Button>
        <Button
          variant="primary"
          onClick={() => saveSection(part)}
          disabled={state !== undefined}
        >
          {state === "save" ? "저장 중…" : "저장"}
        </Button>
        {found && (
          <span className={`text-[11px] ${found.ok ? "text-emerald-300/80" : "text-red-400"}`}>
            {found.ok ? "✓ " : "✕ "}
            {found.message}
          </span>
        )}
        {state === "test" && (
          <span className="text-[11px] text-white/35">다른 화면에 다녀오셔도 됩니다</span>
        )}
      </div>
    );
  };

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

  /*
   * **한 줄이다.** 진행과 결과는 알림(`TaskToasts`)이 맡는다 — 여기에도 로딩바를 두면
   * 같은 것을 두 군데서 말하게 되고, 폼을 닫으면 그중 하나가 사라져 앞뒤가 안 맞는다
   */
  const actions = (
    <>
      <span className="mr-auto text-[11px] text-white/35">
        {testing
          ? "확인 중입니다. 다른 화면에 다녀오셔도 됩니다"
          : notice
            ? notice
            : canSave
              ? ""
              : canTest
                ? "연결 테스트를 통과해야 저장할 수 있습니다"
                : "필수 항목을 채워 주세요"}
      </span>
      {!inline && (
        <Button onClick={onClose} disabled={testing}>
          취소
        </Button>
      )}
      <Button onClick={test} disabled={testing}>
        {testing ? "확인 중…" : "전체 테스트"}
      </Button>
      <Button variant="primary" onClick={save} disabled={testing}>
        저장
      </Button>
    </>
  );

  /* 테스트 중에는 아무것도 못 만진다 — 값이 바뀌면 시험 중인 대상과 화면이 어긋난다 */
  const body = (
      <fieldset disabled={testing} className={`flex flex-col gap-5 ${testing ? "opacity-50" : ""}`}>
        <Labeled label="이름" hint="목록에서 이 연결을 부를 이름입니다" bad={bad("name")}>
          <input
            value={form.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="내 Neon"
            className={FIELD_INPUT}
          />
        </Labeled>

        <Section title="데이터베이스" required disabled={busy.db !== undefined}>
          <Labeled label="JDBC 주소" keyName="url" bad={bad("db.url")}>
            <input
              value={form.db.url}
              onChange={(e) => setDb({ url: e.target.value })}
              placeholder="jdbc:postgresql://호스트/DB이름?sslmode=require"
              spellCheck={false}
              className={FIELD_INPUT}
            />
          </Labeled>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Labeled label="사용자" keyName="user" bad={bad("db.user")}>
              <input
                value={form.db.user}
                onChange={(e) => setDb({ user: e.target.value })}
                spellCheck={false}
                autoComplete="off"
                className={FIELD_INPUT}
              />
            </Labeled>
            <SecretField
              label="비밀번호"
              keyName="password"
              value={form.db.password}
              onChange={(v) => setDb({ password: v })}
            />
          </div>
          <Labeled
            label="스키마 (선택)"
            keyName="currentSchema"
            hint="적으면 그 스키마 안에만 테이블을 만듭니다. 다른 프로그램과 한 DB를 나눠 쓸 때."
          >
            <input
              value={form.db.schema ?? ""}
              onChange={(e) => setDb({ schema: e.target.value })}
              placeholder="starlog"
              spellCheck={false}
              className={FIELD_INPUT}
            />
          </Labeled>
          <Footer part="db" ready={Boolean(form.db.url.trim() && form.db.user.trim())} />
        </Section>

        <Section
          title="커버 스토리지"
          disabled={busy.storage !== undefined}
          hint="선택입니다. 쓰지 않으시려면 아래 칸을 모두 비워 주세요."
        >
          <Labeled label="엔드포인트" keyName="endpoint" bad={bad("storage.endpoint")}>
            <input
              value={form.storage?.endpoint ?? ""}
              onChange={(e) => setStorage({ endpoint: e.target.value })}
              placeholder="https://….r2.cloudflarestorage.com"
              spellCheck={false}
              className={FIELD_INPUT}
            />
          </Labeled>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Labeled label="버킷" keyName="bucket" bad={bad("storage.bucket")}>
              <input
                value={form.storage?.bucket ?? ""}
                onChange={(e) => setStorage({ bucket: e.target.value })}
                spellCheck={false}
                className={FIELD_INPUT}
              />
            </Labeled>
            <Labeled
              label="공개 주소"
              keyName="public-base-url"
              bad={bad("storage.publicBaseUrl")}
            >
              <input
                value={form.storage?.publicBaseUrl ?? ""}
                onChange={(e) => setStorage({ publicBaseUrl: e.target.value })}
                spellCheck={false}
                className={FIELD_INPUT}
              />
            </Labeled>
            <Labeled label="액세스 키" keyName="access-key" bad={bad("storage.accessKey")}>
              <input
                value={form.storage?.accessKey ?? ""}
                onChange={(e) => setStorage({ accessKey: e.target.value })}
                spellCheck={false}
                autoComplete="off"
                className={FIELD_INPUT}
              />
            </Labeled>
            <SecretField
              label="시크릿 키"
              keyName="secret-key"
              value={form.storage?.secretKey ?? ""}
              onChange={(v) => setStorage({ secretKey: v })}
              bad={bad("storage.secretKey")}
            />
          </div>

          <div className="rounded-md border border-white/10 bg-white/[0.03] px-3.5 py-3">
            <div className="text-[10px] font-semibold tracking-widest text-white/40 uppercase">
              스토리지 사용
            </div>
            <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-2">
              <Check
                label="커버"
                checked={Boolean(form.mediaTargets?.covers)}
                disabled={!storageReady}
                onChange={(v) => setTargets({ covers: v })}
              />
              <Check
                label="스크린샷"
                checked={Boolean(form.mediaTargets?.screenshots)}
                disabled={!storageReady}
                onChange={(v) => setTargets({ screenshots: v })}
              />
            </div>
            <p className="mt-2.5 text-[11px] leading-relaxed text-white/30">
              {storageReady
                ? "체크하지 않은 것은 데이터 폴더에 저장됩니다."
                : "스토리지 칸을 모두 채우시면 켤 수 있습니다. 지금은 모두 데이터 폴더에 저장됩니다."}
            </p>
          </div>
          {/*
            스토리지 테스트는 **메모리 DB로** 시험용을 띄운다 — 위 데이터베이스 칸이 틀려도
            스토리지만 따로 볼 수 있다. 섹션별 테스트가 뜻을 가지려면 그래야 한다
          */}
          <Footer part="storage" ready={storageReady} />
        </Section>

        <Section
          title="IGDB"
          disabled={busy.igdb !== undefined}
          hint="선택입니다. 비워두시면 게임 검색 대신 직접 등록으로 씁니다."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Labeled label="클라이언트 ID" keyName="client-id" bad={bad("igdb.clientId")}>
              <input
                value={form.igdb?.clientId ?? ""}
                onChange={(e) => setIgdb({ clientId: e.target.value })}
                spellCheck={false}
                autoComplete="off"
                className={FIELD_INPUT}
              />
            </Labeled>
            <SecretField
              label="클라이언트 시크릿"
              keyName="client-secret"
              value={form.igdb?.clientSecret ?? ""}
              onChange={(v) => setIgdb({ clientSecret: v })}
              bad={bad("igdb.clientSecret")}
            />
          </div>
          <Footer
            part="igdb"
            ready={Boolean(form.igdb?.clientId?.trim() && form.igdb?.clientSecret?.trim())}
          />
        </Section>

        {/*
          번역은 **키 하나뿐이라 "일부만 채움"이 없다** — 스토리지·IGDB처럼 빈칸 검사를
          걸 이유가 없다. 대신 ⚠️ 여기만 한도를 넘으면 돈이 나가므로 그 사실을 적는다
        */}
        <Section
          title="번역"
          disabled={busy.translate !== undefined}
          hint="선택입니다. 게임 소개문을 한국어로 옮깁니다. 비워두시면 번역 기능이 꺼집니다."
        >
          <SecretField
            label="Google Cloud Translation API 키"
            keyName="translate.apiKey"
            value={form.translate?.apiKey ?? ""}
            onChange={(v) => patch({ translate: { apiKey: v } })}
            placeholder="AIza…"
          />
          <p className="mt-2 text-[11px] leading-relaxed text-amber-200/60">
            무료 한도(월 50만 자)를 넘으면 <b>요금이 청구됩니다.</b> 구글 콘솔에서 하루 할당량을
            함께 걸어두시길 권합니다 — 앱도 월 45만 자에서 미리 막습니다.
          </p>
          <Footer part="translate" ready={Boolean(form.translate?.apiKey?.trim())} />
        </Section>

        {showGaps && gaps.length > 0 && (
          <p className="text-[11px] leading-relaxed text-red-400">
            빨갛게 표시된 칸을 채워 주세요. 스토리지나 IGDB를 쓰지 않으시려면 그 묶음을
            <b> 모두 비워</b> 주세요 — 일부만 채우면 조용히 실패합니다.
          </p>
        )}
      </fieldset>
  );

  if (inline) {
    return (
      <div className="flex flex-col gap-5">
        {body}
        <div className="flex flex-wrap items-center gap-2 border-t border-white/8 pt-5">
          {actions}
        </div>
      </div>
    );
  }

  return (
    <Modal
      title={initial ? "연결 수정" : "새 연결"}
      width="max-w-2xl"
      /* 테스트 중에도 닫을 수 있다 — 결과는 알림이 들고 있고, 값은 초안이 지킨다 */
      onClose={onClose}
      footer={actions}
    >
      {body}
    </Modal>
  );
}


/**
 * 라벨 + 실제 키 이름.
 *
 * "공개 주소"만 보고 `public-base-url`을 떠올리기 어렵다 — 벤더 문서와 대조하려면
 * **원래 이름**이 필요하다. 작게 병기한다
 */
function Labeled({
  label,
  keyName,
  hint,
  bad,
  children,
}: {
  label: string;
  keyName?: string;
  hint?: string;
  bad?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline gap-1.5">
        <span
          className={`text-[10px] font-semibold tracking-widest uppercase ${
            bad ? "text-red-400" : "text-white/40"
          }`}
        >
          {label}
        </span>
        {keyName && <span className="font-mono text-[10px] text-white/20">{keyName}</span>}
      </span>
      <div className={bad ? "[&>input]:border-red-500/60" : undefined}>{children}</div>
      {hint && <span className="text-[11px] text-white/30">{hint}</span>}
    </label>
  );
}

/** 체크하면 **체크표시**가 뜬다 — 흰 사각형만 차는 건 켜진 건지 꺼진 건지 헷갈렸다 */
function Check({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={`flex items-center gap-2 text-sm ${
        disabled ? "cursor-not-allowed text-white/25" : "cursor-pointer text-white/80"
      }`}
    >
      <span className="relative flex h-4 w-4 items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer h-4 w-4 appearance-none rounded border border-white/25 bg-white/5 transition-colors checked:border-white checked:bg-white disabled:opacity-40"
        />
        <svg
          viewBox="0 0 12 12"
          className="pointer-events-none absolute h-3 w-3 stroke-black opacity-0 peer-checked:opacity-100"
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2.5 6.5 5 9l4.5-5.5" />
        </svg>
      </span>
      {label}
    </label>
  );
}

function Section({
  title,
  hint,
  required,
  disabled,
  children,
}: {
  title: string;
  hint?: string;
  required?: boolean;
  /**
   * 이 섹션이 지금 시험·저장 중인가.
   *
   * ⚠️ **폼 전체가 아니라 이 묶음만 잠근다** (2026-08-28). 섹션마다 따로 도는 게 요점이라,
   * IGDB를 시험하는 20초 동안 번역 칸까지 막히면 나눈 뜻이 없다
   */
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 border-t border-white/8 pt-5">
      <div>
        <h3 className="text-[11px] font-semibold tracking-widest text-white/50 uppercase">
          {title}
          {required && <span className="ml-1.5 text-white/25 normal-case">필수</span>}
        </h3>
        {hint && <p className="mt-1 text-[11px] text-white/30">{hint}</p>}
      </div>
      <fieldset
        disabled={disabled}
        className={`flex flex-col gap-4 ${disabled ? "opacity-50" : ""}`}
      >
        {children}
      </fieldset>
    </section>
  );
}

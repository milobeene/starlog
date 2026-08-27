"use client";

import { useMemo, useState } from "react";
import Modal from "@/components/ui/Modal";
import EntryLoader from "@/components/ui/EntryLoader";
import SecretField from "./SecretField";
import { Button, Field, FIELD_INPUT } from "@/components/ui/Field";
import {
  diagnosticOf,
  getBridge,
  type ConnectionProfile,
  type ConnectionTestResult,
} from "@/lib/desktop";

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
  const [form, setForm] = useState<ConnectionProfile>({ ...EMPTY, ...initial });
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ConnectionTestResult | null>(null);
  /** 비활성 버튼을 눌렀을 때 어디를 채워야 하는지 빨갛게 표시한다 */
  const [showGaps, setShowGaps] = useState(false);

  const patch = (next: Partial<ConnectionProfile>) => {
    setForm((f) => ({ ...f, ...next }));
    setResult(null);   // 값이 바뀌면 옛 테스트 결과는 거짓말이 된다
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
  const canSave = canTest && result?.ok === true;

  const test = async () => {
    if (!canTest) {
      setShowGaps(true);
      return;
    }
    setTesting(true);
    setResult(null);
    try {
      setResult(await getBridge()!.connections.test(form));
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
    onSaved(form);
  };

  const bad = (key: string) => showGaps && gaps.includes(key);

  /*
   * **결과와 진행은 버튼 옆에 둔다.** 스크롤되는 본문 안에 두면 폼이 길어서
   * 눌러놓고 아래로 내려가야 보였다 — 방금 누른 것의 답이 화면 밖에 있으면 안 된다
   */
  const status = (
    <>
      {testing && (
        <div className="mr-auto">
          <EntryLoader label="연결을 확인하는 중" />
        </div>
      )}
      {!testing && result && <TestReport result={result} />}
      {!testing && !result && notice && (
        <span className="mr-auto text-[11px] text-emerald-300/80">{notice}</span>
      )}
      {!testing && !result && !notice && !canSave && (
        <span className="mr-auto text-[11px] text-white/35">
          {canTest ? "연결 테스트를 통과해야 저장할 수 있습니다" : "필수 항목을 채워 주세요"}
        </span>
      )}
    </>
  );

  const actions = (
    <>
      {!inline && (
        <Button onClick={onClose} disabled={testing}>
          취소
        </Button>
      )}
      <Button onClick={test} disabled={testing}>
        {testing ? "확인 중…" : "연결 테스트"}
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

        <Section title="데이터베이스" required>
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
        </Section>

        <Section
          title="커버 스토리지"
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
        </Section>

        <Section
          title="IGDB"
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
        <div className="flex flex-col gap-3 border-t border-white/8 pt-5">
          {status}
          <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
        </div>
      </div>
    );
  }

  return (
    <Modal
      title={initial ? "연결 수정" : "새 연결"}
      width="max-w-2xl"
      /* ⚠️ 테스트 중에는 못 닫는다 — 닫는 순간 백엔드가 오가는 중이라 상태가 꼬인다 */
      onClose={testing ? () => {} : onClose}
      footer={
        <div className="flex w-full flex-col gap-3">
          {status}
          <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
        </div>
      }
    >
      {body}
    </Modal>
  );
}

/**
 * 테스트 결과를 **부분별로** 보여준다.
 *
 * "실패했습니다" 한 줄이면 DB가 문제인지 키가 문제인지 알 수가 없다.
 * 안 채운 묶음은 아예 안 그린다 — 시험하지 않은 것을 회색 점으로 두면 실패처럼 보인다
 */
function TestReport({ result }: { result: ConnectionTestResult }) {
  return (
    <div
      className={`flex w-full flex-col gap-1.5 rounded-md border px-3 py-2.5 text-xs ${
        result.ok
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-red-500/30 bg-red-500/5"
      }`}
    >
      <Line
        ok={result.database.ok}
        label="데이터베이스"
        detail={result.database.ok ? "연결됨" : diagnosticOf(result.code).title}
      />
      {result.storage && (
        <Line
          ok={result.storage.ok}
          label="커버 스토리지"
          detail={result.storage.ok ? "자격증명 확인됨" : "연결하지 못했습니다"}
        />
      )}
      {result.igdb && (
        <Line ok={result.igdb.ok} label="IGDB" detail={result.igdb.message ?? ""} />
      )}
      {!result.ok && !result.database.ok && (
        <p className="mt-1 text-[11px] text-red-300/70">{diagnosticOf(result.code).hint}</p>
      )}
    </div>
  );
}

function Line({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={ok ? "text-emerald-300" : "text-red-400"}>{ok ? "✓" : "✕"}</span>
      <span className="w-24 shrink-0 text-white/70">{label}</span>
      <span className="min-w-0 flex-1 truncate text-white/40">{detail}</span>
    </div>
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
  children,
}: {
  title: string;
  hint?: string;
  required?: boolean;
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
      {children}
    </section>
  );
}

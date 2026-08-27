"use client";

import { useState } from "react";
import SecretField from "./SecretField";
import { Button, Field, FIELD_INPUT } from "@/components/ui/Field";
import { diagnosticOf, getBridge, type ConnectionProfile } from "@/lib/desktop";

/**
 * 클라우드 연결 한 벌 (architecture §3·§7).
 *
 * ## 세 묶음이고 필수는 첫째뿐이다
 *
 *   DB       PostgreSQL 호환 아무거나 — **없으면 앱이 못 뜬다**
 *   스토리지  S3 호환 — 없으면 커버 업로드만 안 된다 (`UnconfiguredFileStorage`가 대신 뜬다)
 *   IGDB     없으면 검색이 안 되고 **직접 등록으로 쓴다**
 *
 * 필수가 하나뿐이라는 게 중요하다. 셋을 다 채워야 시작할 수 있으면
 * 아무도 첫 화면을 못 넘는다
 */
const EMPTY: ConnectionProfile = {
  name: "",
  db: { url: "", user: "", password: "", schema: "" },
  storage: { endpoint: "", bucket: "", accessKey: "", secretKey: "", publicBaseUrl: "" },
  igdb: { clientId: "", clientSecret: "" },
  // 기본은 둘 다 로컬. 아무것도 설정 안 한 사람이 바로 쓸 수 있어야 한다 (§1)
  mediaTargets: { covers: false, screenshots: false },
};

export default function ConnectionForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial?: ConnectionProfile;
  onCancel: () => void;
  onSaved: (profile: ConnectionProfile) => void;
}) {
  const [form, setForm] = useState<ConnectionProfile>({ ...EMPTY, ...initial });
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; code: string | null } | null>(null);

  const set = (patch: Partial<ConnectionProfile>) => setForm((f) => ({ ...f, ...patch }));
  const setDb = (patch: Partial<ConnectionProfile["db"]>) =>
    setForm((f) => ({ ...f, db: { ...f.db, ...patch } }));
  const setStorage = (patch: Partial<NonNullable<ConnectionProfile["storage"]>>) =>
    setForm((f) => ({ ...f, storage: { ...f.storage, ...patch } }));
  const setIgdb = (patch: Partial<NonNullable<ConnectionProfile["igdb"]>>) =>
    setForm((f) => ({ ...f, igdb: { ...f.igdb, ...patch } }));
  const setTargets = (patch: Partial<NonNullable<ConnectionProfile["mediaTargets"]>>) =>
    setForm((f) => ({
      ...f,
      mediaTargets: { covers: false, screenshots: false, ...f.mediaTargets, ...patch },
    }));

  /* 올릴 데가 없으면 체크가 뜻이 없다 — 백엔드도 자격증명이 없으면 무시한다 (MediaTargets) */
  const storageReady = Boolean(form.storage?.endpoint?.trim() && form.storage?.bucket?.trim());

  const ready = form.name.trim() && form.db.url.trim() && form.db.user.trim();

  const test = async () => {
    setTesting(true);
    setResult(null);
    try {
      setResult(await getBridge()!.connections.test(form));
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    await getBridge()!.connections.save(form);
    onSaved(form);
  };

  return (
    <div className="flex flex-col gap-5">
      <Field label="이름" hint="목록에서 이 연결을 부를 이름입니다">
        <input
          value={form.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="내 Neon"
          className={FIELD_INPUT}
        />
      </Field>

      <Section title="데이터베이스" required>
        <Field label="JDBC 주소">
          <input
            value={form.db.url}
            onChange={(e) => setDb({ url: e.target.value })}
            placeholder="jdbc:postgresql://호스트/DB이름?sslmode=require"
            spellCheck={false}
            className={FIELD_INPUT}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="사용자">
            <input
              value={form.db.user}
              onChange={(e) => setDb({ user: e.target.value })}
              spellCheck={false}
              autoComplete="off"
              className={FIELD_INPUT}
            />
          </Field>
          <SecretField
            label="비밀번호"
            value={form.db.password}
            onChange={(v) => setDb({ password: v })}
          />
        </div>
        {/* 이 칸 하나가 "이 DB는 비어있지 않습니다"를 통째로 없앤다 (결정 60) */}
        <Field
          label="스키마 (선택)"
          hint="적으면 그 스키마 안에만 테이블을 만듭니다. 다른 프로그램과 한 DB를 나눠 쓸 때."
        >
          <input
            value={form.db.schema ?? ""}
            onChange={(e) => setDb({ schema: e.target.value })}
            placeholder="starlog"
            spellCheck={false}
            className={FIELD_INPUT}
          />
        </Field>
      </Section>

      <Section title="커버 스토리지" hint="비워두면 커버 업로드만 안 됩니다">
        <Field label="엔드포인트">
          <input
            value={form.storage?.endpoint ?? ""}
            onChange={(e) => setStorage({ endpoint: e.target.value })}
            placeholder="https://…r2.cloudflarestorage.com"
            spellCheck={false}
            className={FIELD_INPUT}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="버킷">
            <input
              value={form.storage?.bucket ?? ""}
              onChange={(e) => setStorage({ bucket: e.target.value })}
              spellCheck={false}
              className={FIELD_INPUT}
            />
          </Field>
          <Field label="공개 주소">
            <input
              value={form.storage?.publicBaseUrl ?? ""}
              onChange={(e) => setStorage({ publicBaseUrl: e.target.value })}
              spellCheck={false}
              className={FIELD_INPUT}
            />
          </Field>
          <Field label="액세스 키">
            <input
              value={form.storage?.accessKey ?? ""}
              onChange={(e) => setStorage({ accessKey: e.target.value })}
              spellCheck={false}
              autoComplete="off"
              className={FIELD_INPUT}
            />
          </Field>
          <SecretField
            label="시크릿 키"
            value={form.storage?.secretKey ?? ""}
            onChange={(v) => setStorage({ secretKey: v })}
          />
        </div>

        {/*
          **무엇을 올릴지 고른다** (사용자 결정 2026-08-28).
          커버와 스크린샷을 따로 켜는 이유 — 스크린샷은 장당 2~5MB에 수백 장이라
          버킷이 먼저 찬다. 하나로 묶으면 "커버만 클라우드에"가 표현이 안 된다
        */}
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
              ? "체크하지 않은 것은 데이터 폴더에 저장됩니다 — 입구 화면 아래에 그 경로가 있습니다."
              : "엔드포인트와 버킷을 채우시면 켤 수 있습니다. 지금은 모두 데이터 폴더에 저장됩니다."}
          </p>
        </div>
      </Section>

      <Section title="IGDB" hint="비워두면 게임 검색 대신 직접 등록으로 씁니다">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="클라이언트 ID">
            <input
              value={form.igdb?.clientId ?? ""}
              onChange={(e) => setIgdb({ clientId: e.target.value })}
              spellCheck={false}
              autoComplete="off"
              className={FIELD_INPUT}
            />
          </Field>
          <SecretField
            label="클라이언트 시크릿"
            value={form.igdb?.clientSecret ?? ""}
            onChange={(v) => setIgdb({ clientSecret: v })}
          />
        </div>
      </Section>

      {result && (
        <div
          className={`rounded-md border px-3 py-2 text-xs ${
            result.ok
              ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
              : "border-red-500/30 bg-red-500/5 text-red-300"
          }`}
        >
          {result.ok ? (
            "연결에 성공했습니다."
          ) : (
            <>
              <strong className="font-medium">{diagnosticOf(result.code).title}</strong>
              <br />
              {diagnosticOf(result.code).hint}
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={save} disabled={!ready}>
          저장
        </Button>
        <Button onClick={test} disabled={!ready || testing}>
          {testing ? "확인 중…" : "연결 테스트"}
        </Button>
        <Button onClick={onCancel}>취소</Button>
      </div>
    </div>
  );
}

/**
 * 체크박스 한 칸.
 *
 * 기본 `<input type="checkbox">`는 OS가 그리는 물건이라 어두운 화면에서 흰 사각형이 뜬다.
 * `appearance-none`으로 그림을 지우고 우리가 그린다 — `Field`가 select에 하는 것과 같은 이유
 */
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
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 appearance-none rounded border border-white/25 bg-white/5 transition-colors checked:border-white checked:bg-white disabled:opacity-40"
      />
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

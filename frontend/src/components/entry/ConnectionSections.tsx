"use client";

import type { ReactNode } from "react";
import SecretField from "./SecretField";
import { Check, Labeled, Section } from "./ConnectionFormParts";
import { FIELD_INPUT } from "@/components/ui/Field";
import type { ConnectionProfile } from "@/lib/desktop";

/**
 * 연결 폼의 섹션들. 값과 테스트·저장 상태는 `useConnectionForm`이 들고,
 * 여기는 칸만 그린다 — 섹션 아래 [테스트]·[저장] 줄은 `footer`로 받는다
 */
interface SectionProps {
  form: ConnectionProfile;
  bad: (key: string) => boolean;
  /** 이 섹션만 시험·저장 중일 때 잠근다 */
  disabled: boolean;
  footer: ReactNode;
}

export function DatabaseSection({
  form,
  setDb,
  bad,
  disabled,
  footer,
}: SectionProps & { setDb: (p: Partial<ConnectionProfile["db"]>) => void }) {
  return (
    <Section title="데이터베이스" required disabled={disabled}>
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
      {footer}
    </Section>
  );
}

export function StorageSection({
  form,
  setStorage,
  setTargets,
  storageReady,
  bad,
  disabled,
  footer,
}: SectionProps & {
  setStorage: (p: Partial<NonNullable<ConnectionProfile["storage"]>>) => void;
  setTargets: (p: Partial<NonNullable<ConnectionProfile["mediaTargets"]>>) => void;
  /** 스토리지 칸이 전부 찼나 — 사용 체크박스가 이걸로 열린다 */
  storageReady: boolean;
}) {
  return (
    <Section
      title="커버 스토리지"
      disabled={disabled}
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
      {footer}
    </Section>
  );
}

export function IgdbSection({
  form,
  setIgdb,
  bad,
  disabled,
  footer,
}: SectionProps & { setIgdb: (p: Partial<NonNullable<ConnectionProfile["igdb"]>>) => void }) {
  return (
    <Section
      title="IGDB"
      disabled={disabled}
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
      {footer}
    </Section>
  );
}

/**
 * 번역은 **키 하나뿐이라 "일부만 채움"이 없다** — 스토리지·IGDB처럼 빈칸 검사를
 * 걸 이유가 없다. 대신 ⚠️ 여기만 한도를 넘으면 돈이 나가므로 그 사실을 적는다
 */
export function TranslateSection({
  form,
  onChange,
  disabled,
  footer,
}: Pick<SectionProps, "form" | "disabled" | "footer"> & { onChange: (apiKey: string) => void }) {
  return (
    <Section
      title="번역"
      disabled={disabled}
      hint="선택입니다. 게임 소개문을 한국어로 옮깁니다. 비워두시면 번역 기능이 꺼집니다."
    >
      <SecretField
        label="Google Cloud Translation API 키"
        keyName="translate.apiKey"
        value={form.translate?.apiKey ?? ""}
        onChange={onChange}
        placeholder="AIza…"
      />
      <p className="mt-2 text-[11px] leading-relaxed text-amber-200/60">
        무료 한도(월 50만 자)를 넘으면 <b>요금이 청구됩니다.</b> 구글 콘솔에서 하루 할당량을
        함께 걸어두시길 권합니다 — 앱도 월 45만 자에서 미리 막습니다.
      </p>
      {footer}
    </Section>
  );
}

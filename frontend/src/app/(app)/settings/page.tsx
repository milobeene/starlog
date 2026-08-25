"use client";

import { Suspense, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import PageHeading from "@/components/ui/PageHeading";
import ErrorNotice from "@/components/ui/ErrorNotice";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Modal from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button, Field, FIELD_DATE, FIELD_INPUT, FIELD_SELECT } from "@/components/ui/Field";
import SettingsSection, { EmptyRow, Row } from "@/components/settings/SettingsSection";
import MarkdownTextarea from "@/components/ui/MarkdownTextarea";
import GoogleResultBanner from "@/components/auth/GoogleResultBanner";
import { useApi } from "@/lib/useApi";
import { api, ApiError, ERROR, errorMessage } from "@/lib/api";
import { logout } from "@/lib/session";
import { BILLING_CYCLE_LABEL, formatMoney } from "@/lib/labels";
import type {
  CompanyDictionary,
  FacetCount,
  FacetsResponse,
  MeResponse,
  OptionsResponse,
} from "@/lib/types";

type Dialog =
  | null
  | { kind: "profile" }
  | { kind: "memo" }
  | { kind: "account" }
  | { kind: "device" }
  | { kind: "subscription" }
  | { kind: "password" }
  | { kind: "withdraw" };

/**
 * 프로필 · 플랫폼 계정 · 보유 기기 · 구독 · 사전 · 계정.
 *
 * 섹션마다 엔드포인트가 다르다 (쓰기는 리소스 단위, API 설계서 §0).
 * 읽기는 `/api/me` 하나가 프로필·계정·기기·구독을 통째로 준다
 */
export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const me = useApi<MeResponse>("/api/me");
  const options = useApi<OptionsResponse>("/api/me/options");
  /*
   * 사전 수정에는 id가 필요한데 /api/me/options는 이름만 준다.
   * facets가 { id, name, count }를 주므로 그쪽을 쓴다 — 게임에 적용 중인 것만 나오는데,
   * 안 붙은 사전 행은 어차피 조회에서 걸러지므로(§6.7 자동 소멸) 고칠 대상도 아니다
   */
  const facets = useApi<FacetsResponse>("/api/backlog/facets");
  const companies = useApi<CompanyDictionary>("/api/backlog/companies");
  const [dialog, setDialog] = useState<Dialog>(null);

  const refresh = () => {
    me.reload();
    options.reload();
    facets.reload();
    companies.reload();
  };

  if (me.error) return <ErrorNotice error={me.error} onRetry={me.reload} />;

  return (
    <main className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-8 pt-24 pb-20">
        <PageHeading
          eyebrow="Settings"
          title="프로필 / 설정"
          subtitle="계정과 기록에 사용되는 정보를 관리하실 수 있습니다."
        />

        <div className="mt-8">
          <GoogleResultBanner basePath="/settings" />
        </div>

        <div className="mt-2 flex flex-col gap-10">
          <SettingsSection
            title="프로필"
            icon="profile"
            action={<Button onClick={() => setDialog({ kind: "profile" })}>수정</Button>}
          >
            {me.loading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-sm font-medium">{me.data?.profile.nickname}</div>
                <div className="text-xs text-white/40">{me.data?.profile.email}</div>
              </div>
            )}
          </SettingsSection>

          {/*
            메모는 자유 서식이라 프로필 폼 한 줄로는 좁다.
            게임 메모와 같은 마크다운 렌더를 써서 보는 것과 쓰는 것을 가른다
          */}
          <SettingsSection
            title="메모"
            icon="note"
            description="자유롭게 기록하실 수 있는 공간입니다. 마크다운을 지원합니다."
            action={<Button onClick={() => setDialog({ kind: "memo" })}>수정</Button>}
          >
            {me.loading ? (
              <Skeleton className="h-24 w-full" />
            ) : me.data?.profile.memo ? (
              <div className="rounded-lg border border-white/10 bg-white/5 px-5 py-4">
                <div className="markdown text-sm leading-relaxed font-light text-white/80">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{me.data.profile.memo}</ReactMarkdown>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-center text-xs text-white/30">
                작성된 메모가 없습니다
              </div>
            )}
          </SettingsSection>

          <SettingsSection
            title="플랫폼 계정"
            icon="account"
            description="Steam·PSN 등 보유하신 계정입니다. 취득 기록에서 선택하실 수 있습니다."
            action={<Button onClick={() => setDialog({ kind: "account" })}>추가</Button>}
          >
            <ul className="flex flex-col gap-2">
              {(me.data?.platformAccounts ?? []).map((account) => (
                <Row key={account.accountId}>
                  <span className="flex-1">{account.label}</span>
                  <span className="text-xs text-white/40">{account.platform.name}</span>
                  <DeleteButton
                    path={`/api/me/platform-accounts/${account.accountId}`}
                    name={account.label}
                    revivable
                    onDone={refresh}
                  />
                </Row>
              ))}
              {me.data?.platformAccounts.length === 0 && <EmptyRow>등록된 항목이 없습니다</EmptyRow>}
            </ul>
          </SettingsSection>

          <SettingsSection
            title="보유 기기"
            icon="device"
            description="회차 기록에서 우선 표시됩니다. 목록에 없는 기기로도 기록하실 수 있습니다."
            action={<Button onClick={() => setDialog({ kind: "device" })}>추가</Button>}
          >
            <ul className="flex flex-col gap-2">
              {(me.data?.devices ?? []).map((device) => (
                <Row key={device.memberDeviceId}>
                  <span className="flex-1">{device.label}</span>
                  <span className="text-xs text-white/40">{device.device.name}</span>
                  <DeleteButton
                    path={`/api/me/devices/${device.memberDeviceId}`}
                    name={device.label}
                    onDone={refresh}
                  />
                </Row>
              ))}
              {me.data?.devices.length === 0 && <EmptyRow>등록된 항목이 없습니다</EmptyRow>}
            </ul>
          </SettingsSection>

          <SettingsSection
            title="구독"
            icon="subscription"
            description="지출 통계에 월 단위로 반영됩니다."
            action={<Button onClick={() => setDialog({ kind: "subscription" })}>추가</Button>}
          >
            <ul className="flex flex-col gap-2">
              {(me.data?.subscriptions ?? []).map((subscription) => (
                <Row key={subscription.subscriptionId}>
                  <span className="flex-1">{subscription.serviceName}</span>
                  <span className="num text-xs text-white/50">
                    {formatMoney(subscription.fee)} / {BILLING_CYCLE_LABEL[subscription.billingCycle]}
                  </span>
                  <span className="num text-xs text-white/30">
                    {subscription.startedOn} ~ {subscription.endedOn ?? ""}
                  </span>
                  <DeleteButton
                    path={`/api/me/subscriptions/${subscription.subscriptionId}`}
                    name={subscription.serviceName}
                    onDone={refresh}
                  />
                </Row>
              ))}
              {me.data?.subscriptions.length === 0 && <EmptyRow>등록된 항목이 없습니다</EmptyRow>}
            </ul>
          </SettingsSection>

          <SettingsSection
            title="사전"
            icon="book"
            description="게임에 사용하신 항목만 표시됩니다. 이름을 변경하시면 해당 게임 전체에 반영됩니다."
          >
            <div className="flex flex-col gap-5">
              <Dictionary
                label="태그"
                items={facets.data?.tags ?? []}
                basePath="/api/me/tags"
                onDone={refresh}
              />
              <Dictionary
                label="장르"
                items={facets.data?.genres ?? []}
                basePath="/api/me/genres"
                onDone={refresh}
              />
              {/*
                개발사·유통사는 엔티티가 아니라 항목에 박힌 문자열이라 id가 없다 →
                일괄 수정 경로가 없어 보기 전용이다. 고치려면 그 게임의 상세에서 바꾼다
              */}
              <ReadOnlyDictionary
                label="개발사"
                names={companies.data?.overriddenDevelopers ?? []}
              />
              <ReadOnlyDictionary
                label="유통사"
                names={companies.data?.overriddenPublishers ?? []}
              />
            </div>
          </SettingsSection>

          <SettingsSection title="계정">
            <div className="flex flex-col gap-2">
              {/*
                이메일은 로그인 아이디라 바꾸려면 새 주소 인증·유니크 검증·pending 상태가 딸린다.
                스펙(FR-AUTH-01~12)에 없는 기능이라 자리만 두고 막아뒀다
              */}
              <button
                disabled
                title="준비 중인 기능입니다. 이메일은 로그인 아이디로 사용되어 새 주소 인증 절차가 필요합니다."
                className="cursor-not-allowed rounded-lg border border-white/10 px-4 py-3 text-left text-sm text-white/35"
              >
                이메일 변경
                <span className="mt-0.5 block text-xs text-white/20">준비 중</span>
              </button>

              {/*
                구글로 가입한 계정은 비밀번호가 없다 — 그래서 "변경"이 아니라 "설정"이다.
                이걸 만들어야 구글 연결 해제도 열린다 (BR-AUTH-01)
              */}
              <button
                onClick={() => setDialog({ kind: "password" })}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-left text-sm transition-colors hover:border-white/25"
              >
                {me.data?.profile.hasPassword ? "비밀번호 변경" : "비밀번호 설정"}
                <span className="mt-0.5 block text-xs text-white/35">
                  {me.data?.profile.hasPassword
                    ? "현재 비밀번호를 확인한 뒤 변경합니다"
                    : "구글로 가입하신 계정입니다. 비밀번호를 설정하시면 이메일로도 로그인하실 수 있습니다"}
                </span>
              </button>

              {/*
                연결 여부에 따라 하나만 보여준다 — 둘을 늘 띄우면 구글로 가입한 계정에도
                "연결" 버튼이 살아 있어 이미 된 걸 또 하라는 것처럼 읽힌다
              */}
              {me.data?.profile.googleLinked ? (
                <button
                  onClick={async () => {
                    if (!me.data?.profile.hasPassword) return;
                    try {
                      await api.del("/api/me/google");
                      refresh();
                    } catch (caught) {
                      alert(
                        caught instanceof ApiError
                          ? caught.message
                          : "연결을 해제하지 못했습니다.",
                      );
                    }
                  }}
                  disabled={!me.data?.profile.hasPassword}
                  title={
                    me.data?.profile.hasPassword
                      ? undefined
                      : "비밀번호를 먼저 설정하셔야 해제하실 수 있습니다"
                  }
                  className={`rounded-lg border border-white/10 px-4 py-3 text-left text-sm transition-colors ${
                    me.data?.profile.hasPassword
                      ? "text-white/60 hover:border-white/25 hover:text-white"
                      : "cursor-not-allowed text-white/25"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    Google 계정 연결 해제
                    <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                      연결됨
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs text-white/35">
                    {me.data?.profile.hasPassword
                      ? "해제하시면 이메일과 비밀번호로만 로그인하실 수 있습니다"
                      : "로그인 수단이 구글뿐입니다. 비밀번호를 먼저 설정해 주세요"}
                  </span>
                </button>
              ) : (
                <a
                  href={`${process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080"}/oauth2/authorization/google`}
                  className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm transition-colors hover:border-white/25"
                >
                  Google 계정 연결
                  <span className="mt-0.5 block text-xs text-white/35">
                    연결하시면 구글 계정으로도 로그인하실 수 있습니다
                  </span>
                </a>
              )}

              <button
                onClick={() => setDialog({ kind: "withdraw" })}
                className="rounded-lg border border-red-500/20 px-4 py-3 text-left text-sm text-red-400 transition-colors hover:bg-red-500/10"
              >
                회원 탈퇴
                <span className="mt-0.5 block text-xs text-red-400/50">
                  탈퇴 요청 후 30일이 지나면 완전히 삭제됩니다
                </span>
              </button>
            </div>
          </SettingsSection>
        </div>
      </div>

      {(dialog?.kind === "profile" || dialog?.kind === "memo") && me.data && (
        <ProfileDialog
          profile={me.data.profile}
          field={dialog.kind === "memo" ? "memo" : "nickname"}
          onClose={() => setDialog(null)}
          onSaved={refresh}
        />
      )}
      {dialog?.kind === "account" && (
        <AccountDialog
          platforms={options.data?.platforms ?? []}
          onClose={() => setDialog(null)}
          onSaved={refresh}
        />
      )}
      {dialog?.kind === "device" && (
        <DeviceDialog
          devices={options.data?.devices ?? []}
          onClose={() => setDialog(null)}
          onSaved={refresh}
        />
      )}
      {dialog?.kind === "subscription" && (
        <SubscriptionDialog onClose={() => setDialog(null)} onSaved={refresh} />
      )}
      {dialog?.kind === "password" && me.data && (
        <PasswordDialog
          hasPassword={me.data.profile.hasPassword}
          onClose={() => setDialog(null)}
          onSaved={refresh}
        />
      )}
      {dialog?.kind === "withdraw" && (
        <ConfirmDialog
          title="회원 탈퇴"
          confirmLabel="탈퇴하기"
          message={
            <>
              탈퇴하시면 <b className="text-white">즉시 로그아웃되며</b> 30일 후 기록이 완전히 삭제됩니다.
              <br />
              유예 기간 내에 다시 로그인하시면 복구하실 수 있습니다.
            </>
          }
          onConfirm={async () => {
            await api.del("/api/me");
            await logout();
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </main>
  );
}

/**
 * 삭제 확인. 예전에는 누르는 즉시 지워져서 되돌릴 방법도 안내도 없었다.
 *
 * 계정과 기기는 **지워지는 방식이 다르다** (§7.4) — 그래서 문구도 다르다:
 * 계정은 소프트 삭제라 같은 이름으로 다시 만들면 되살릴 수 있고,
 * 기기는 물리 삭제라 돌아오지 않는다
 */
function DeleteButton({
  path,
  name,
  revivable,
  onDone,
}: {
  path: string;
  name: string;
  revivable?: boolean;
  onDone: () => void;
}) {
  const [asking, setAsking] = useState(false);

  return (
    <>
      <button
        onClick={() => setAsking(true)}
        className="shrink-0 text-xs text-white/30 transition-colors hover:text-red-400"
      >
        삭제
      </button>

      {asking && (
        <ConfirmDialog
          title={`${name} 삭제`}
          message={
            revivable ? (
              <>
                <b className="text-white">{name}</b>을(를) 삭제합니다. 이 계정에 연결된 과거
                회차·취득 기록에는 이름이 그대로 남습니다.
                <br />
                나중에 같은 이름으로 다시 추가하시면 <b className="text-white">복원하실 수 있습니다.</b>
              </>
            ) : (
              <>
                <b className="text-white">{name}</b>을(를) 삭제합니다. 이 항목은{" "}
                <b className="text-white">복원되지 않습니다.</b>
              </>
            )
          }
          onConfirm={async () => {
            await api.del(path);
            onDone();
          }}
          onClose={() => setAsking(false)}
        />
      )}
    </>
  );
}

/**
 * 태그·장르 사전 — 이름 변경·삭제 (FR-TAG-02, MUST).
 *
 * 추가는 없다. 게임에 적으면 생기고 다 떼면 사라지는 **IntelliJ 사전 방식**이다 (§6.7).
 *
 * 둘 다 **적용 중인 게임 전부에 한 번에 반영**되므로 개수를 먼저 보여준다 —
 * 삭제는 연결을 통째로 끊는 거라 되돌릴 수 없다
 */
function Dictionary({
  label,
  items,
  basePath,
  onDone,
}: {
  label: string;
  items: FacetCount[];
  basePath: string;
  onDone: () => void;
}) {
  const [editing, setEditing] = useState<FacetCount | null>(null);
  const [removing, setRemoving] = useState<FacetCount | null>(null);
  // 사전이 수십 개까지 늘어난다 — 두 줄만 보이고 나머지는 접어둔다
  const [open, setOpen] = useState(false);
  const collapsible = items.length > 12;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[10px] font-semibold tracking-widest text-white/35 uppercase">
          {label}
        </span>
        <span className="num text-[10px] text-white/25">{items.length}</span>
        {collapsible && (
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="ml-auto text-[11px] text-white/35 transition-colors hover:text-white"
          >
            {open ? "접기" : "전체 보기"}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-white/25">사용 중인 항목이 없습니다. 게임에 지정하시면 이곳에 표시됩니다.</p>
      ) : (
        <div className={`flex flex-wrap gap-1.5 ${open ? "" : "max-h-[4.5rem] overflow-hidden"}`}>
          {items.map((item) => (
            <span
              key={item.id}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pr-1.5 pl-2.5 text-xs text-white/70"
            >
              {item.name}
              <span className="num text-white/25">{item.count}</span>
              <button
                type="button"
                onClick={() => setEditing(item)}
                aria-label={`${item.name} 이름 바꾸기`}
                className="text-white/30 transition-colors hover:text-white"
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setRemoving(item)}
                aria-label={`${item.name} 삭제`}
                className="text-white/30 transition-colors hover:text-red-400"
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {editing && (
        <RenameDialog
          item={editing}
          basePath={basePath}
          onClose={() => setEditing(null)}
          onSaved={onDone}
        />
      )}

      {removing && (
        <ConfirmDialog
          title={`${removing.name} 삭제`}
          message={
            <>
              <b className="text-white">{removing.name}</b>을(를) 삭제하시면{" "}
              <b className="text-white">{removing.count}개 항목</b>에서 함께 해제됩니다.
              <br />
              게임 자체는 삭제되지 않으나, 연결은 복구되지 않습니다.
            </>
          }
          onConfirm={async () => {
            await api.del(`${basePath}/${removing.id}`);
            onDone();
          }}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  );
}

/** id가 없어 고칠 수 없는 사전 — 무엇이 쌓였는지만 보여준다 */
function ReadOnlyDictionary({ label, names }: { label: string; names: string[] }) {
  const [open, setOpen] = useState(false);
  const collapsible = names.length > 12;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[10px] font-semibold tracking-widest text-white/35 uppercase">
          {label}
        </span>
        <span className="num text-[10px] text-white/25">{names.length}</span>
        {collapsible && (
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="ml-auto text-[11px] text-white/35 transition-colors hover:text-white"
          >
            {open ? "접기" : "전체 보기"}
          </button>
        )}
      </div>

      {names.length === 0 ? (
        <p className="text-xs text-white/25">직접 입력하신 값이 없습니다. 게임 상세에서 수정하시면 이곳에 표시됩니다.</p>
      ) : (
        <div className={`flex flex-wrap gap-1.5 ${open ? "" : "max-h-[4.5rem] overflow-hidden"}`}>
          {names.map((name) => (
            <span
              key={name}
              className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/60"
            >
              {name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function RenameDialog({
  item,
  basePath,
  onClose,
  onSaved,
}: {
  item: FacetCount;
  basePath: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(item.name);
  return (
    <FormDialog
      title="이름 바꾸기"
      onClose={onClose}
      onSubmit={async () => {
        await api.put(`${basePath}/${item.id}`, { name });
        onSaved();
      }}
    >
      <p className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-[11px] leading-relaxed text-white/45">
        적용 중인 <b className="text-white/75">{item.count}개 항목</b>에 일괄 반영됩니다.
      </p>
      <Field label="Name">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={50}
          className={FIELD_INPUT}
        />
      </Field>
    </FormDialog>
  );
}

function ProfileDialog({
  profile,
  field,
  onClose,
  onSaved,
}: {
  profile: MeResponse["profile"];
  field: "nickname" | "memo";
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nickname, setNickname] = useState(profile.nickname);
  const [memo, setMemo] = useState(profile.memo ?? "");

  return (
    <FormDialog
      title={field === "nickname" ? "프로필" : "메모"}
      onClose={onClose}
      onSubmit={async () => {
        await api.put("/api/me/profile", { nickname, memo: memo.trim() || null });
        onSaved();
      }}
    >
      {field === "nickname" ? (
        <Field label="Nickname">
          <input
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            maxLength={30}
            className={FIELD_INPUT}
          />
        </Field>
      ) : (
        <Field label="Memo" hint="마크다운을 지원합니다 · Enter로 목록 이어쓰기, Tab으로 들여쓰기 · 2,000자 이내">
          <MarkdownTextarea value={memo} onChange={setMemo} rows={12} maxLength={2000} />
        </Field>
      )}
    </FormDialog>
  );
}

/**
 * 비밀번호 변경·설정.
 *
 * 비밀번호가 없는 계정(구글 가입)은 **현재 비밀번호 칸 자체를 안 보여준다** —
 * 없는 값을 물으면 뭘 넣어야 할지 알 수 없다. 서버도 그 경우엔 대조를 건너뛴다
 */
function PasswordDialog({
  hasPassword,
  onClose,
  onSaved,
}: {
  hasPassword: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  return (
    <FormDialog
      title={hasPassword ? "비밀번호 변경" : "비밀번호 설정"}
      onClose={onClose}
      onSubmit={async () => {
        if (next !== confirm) throw new Error("새 비밀번호가 서로 다릅니다");
        if (next.length < 4 || next.length > 64) throw new Error("비밀번호는 4~64자로 입력해 주세요");
        await api.put("/api/me/password", {
          currentPassword: hasPassword ? current : null,
          newPassword: next,
        });
        onSaved();
      }}
    >
      {!hasPassword && (
        <p className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-[11px] leading-relaxed text-white/45">
          구글로 가입하신 계정이라 비밀번호가 없습니다. 설정하시면 이메일로도 로그인하실 수 있고,
          구글 연결도 해제하실 수 있습니다.
        </p>
      )}

      {hasPassword && (
        <Field label="Current Password">
          <input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            className={FIELD_INPUT}
          />
        </Field>
      )}

      <Field label="New Password" hint="4~64자">
        <input
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(event) => setNext(event.target.value)}
          className={FIELD_INPUT}
        />
      </Field>

      <Field label="Confirm">
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          className={FIELD_INPUT}
        />
      </Field>
    </FormDialog>
  );
}

/**
 * 플랫폼 계정 추가.
 *
 * 같은 (플랫폼, 라벨)로 삭제된 계정이 있으면 서버가 `409 REVIVABLE`에 대상 id를 실어 준다 —
 * **되살리면 그 계정에 매달린 회차·취득 기록이 함께 돌아온다** (§7.4).
 * 예전에는 안내만 하고 버튼이 없어 아무것도 할 수 없었다
 */
function AccountDialog({
  platforms,
  onClose,
  onSaved,
}: {
  platforms: { id: number; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [platformId, setPlatformId] = useState("");
  const [label, setLabel] = useState("");
  const [revivable, setRevivable] = useState<number | null>(null);

  if (revivable !== null) {
    return (
      <ConfirmDialog
        title="삭제된 계정 복원"
        confirmLabel="복원"
        message={
          <>
            같은 이름의 삭제된 계정이 있습니다. 복원하시면{" "}
            <b className="text-white">이 계정에 연결된 회차·취득 기록도 함께 돌아옵니다.</b>
          </>
        }
        onConfirm={async () => {
          await api.post(`/api/me/platform-accounts/${revivable}/revive`);
          onSaved();
          onClose();
        }}
        onClose={() => setRevivable(null)}
      />
    );
  }

  return (
    <FormDialog
      title="플랫폼 계정 추가"
      onClose={onClose}
      onSubmit={async () => {
        try {
          await api.post("/api/me/platform-accounts", {
            platformId: Number(platformId),
            accountLabel: label,
          });
        } catch (caught) {
          // 되살릴 수 있으면 에러가 아니라 선택지다 — 확인 화면으로 갈아탄다
          if (caught instanceof ApiError && caught.code === ERROR.REVIVABLE) {
            const body = caught.body as { targetId?: number } | undefined;
            if (body?.targetId) {
              setRevivable(body.targetId);
              return;
            }
          }
          throw caught;
        }
        onSaved();
      }}
    >
      <Field label="Platform">
        <select
          value={platformId}
          onChange={(event) => setPlatformId(event.target.value)}
          className={FIELD_SELECT}
        >
          <option value="">선택</option>
          {platforms.map((platform) => (
            <option key={platform.id} value={platform.id}>
              {platform.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Label" hint="예) 본계정, 서브계정">
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          maxLength={50}
          className={FIELD_INPUT}
        />
      </Field>
    </FormDialog>
  );
}

function DeviceDialog({
  devices,
  onClose,
  onSaved,
}: {
  devices: { id: number; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [deviceId, setDeviceId] = useState("");
  const [label, setLabel] = useState("");
  const [memo, setMemo] = useState("");
  return (
    <FormDialog
      title="보유 기기 추가"
      onClose={onClose}
      onSubmit={async () => {
        await api.post("/api/me/devices", {
          deviceId: Number(deviceId),
          label,
          memo: memo.trim() || null,
        });
        onSaved();
      }}
    >
      <Field label="Device">
        <select
          value={deviceId}
          onChange={(event) => setDeviceId(event.target.value)}
          className={FIELD_SELECT}
        >
          <option value="">선택</option>
          {devices.map((device) => (
            <option key={device.id} value={device.id}>
              {device.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Label" hint="예) 거실 스위치">
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          maxLength={50}
          className={FIELD_INPUT}
        />
      </Field>
      <Field label="Memo" hint="마크다운 · Enter로 목록 이어쓰기, Tab으로 들여쓰기">
        <MarkdownTextarea value={memo} onChange={setMemo} rows={6} maxLength={2000} />
      </Field>
    </FormDialog>
  );
}

function SubscriptionDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [serviceName, setServiceName] = useState("");
  const [startedOn, setStartedOn] = useState("");
  const [endedOn, setEndedOn] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("KRW");
  const [billingCycle, setBillingCycle] = useState("MONTHLY");

  return (
    <FormDialog
      title="구독 추가"
      onClose={onClose}
      onSubmit={async () => {
        await api.post("/api/me/subscriptions", {
          serviceName,
          startedOn,
          endedOn: endedOn || null,
          fee: amount ? { amount: Number(amount), currency } : null,
          billingCycle,
        });
        onSaved();
      }}
    >
      <Field label="Service">
        <input
          value={serviceName}
          onChange={(event) => setServiceName(event.target.value)}
          maxLength={100}
          placeholder="Nintendo Switch Online"
          className={FIELD_INPUT}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Started">
          <input
            type="date"
            value={startedOn}
            onChange={(event) => setStartedOn(event.target.value)}
            className={FIELD_DATE}
          />
        </Field>
        <Field label="Ended" hint="비우면 구독 중">
          <input
            type="date"
            value={endedOn}
            onChange={(event) => setEndedOn(event.target.value)}
            className={FIELD_DATE}
          />
        </Field>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-3">
        <Field label="Fee">
          <input
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))}
            className={`${FIELD_INPUT} num`}
          />
        </Field>
        <Field label="Currency">
          <select
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
            className={FIELD_SELECT}
          >
            {["KRW", "USD", "JPY"].map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Cycle">
          <select
            value={billingCycle}
            onChange={(event) => setBillingCycle(event.target.value)}
            className={FIELD_SELECT}
          >
            <option value="MONTHLY">월간</option>
            <option value="YEARLY">연간</option>
          </select>
        </Field>
      </div>
    </FormDialog>
  );
}

/** 설정의 폼 다이얼로그가 전부 같은 모양이라 저장·에러 처리를 여기 모았다 */
function FormDialog({
  title,
  onClose,
  onSubmit,
  children,
}: {
  title: string;
  onClose: () => void;
  onSubmit: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          {error && <span className="mr-auto text-xs text-red-400">{error}</span>}
          <Button onClick={onClose}>취소</Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onSubmit();
                onClose();
              } catch (caught) {
                setError(errorMessage(caught, "저장하지 못했습니다. 잠시 후 다시 시도해 주세요."));
                setBusy(false);
              }
            }}
          >
            {busy ? "저장 중" : "저장"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">{children}</div>
    </Modal>
  );
}

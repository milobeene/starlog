"use client";

import { TAG_COLOR_NAMES, TAG_COLORS, toneOf } from "@/lib/tagColors";
import DateField from "@/components/ui/DateField";
import { Fragment, Suspense, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import PageHeading from "@/components/ui/PageHeading";
import ErrorNotice from "@/components/ui/ErrorNotice";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Modal from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button, Field, FIELD_INPUT, FIELD_SELECT } from "@/components/ui/Field";
import SettingsSection, { EmptyRow, Row } from "@/components/settings/SettingsSection";
import MarkdownTextarea from "@/components/ui/MarkdownTextarea";
import MoneyText from "@/components/ui/Money";
import { useApi } from "@/lib/useApi";
import { api, ApiError, ERROR, errorMessage } from "@/lib/api";
import { refreshSession } from "@/lib/session";
import PaletteEditor from "@/components/settings/PaletteEditor";
import DeletedEntriesSection from "@/components/settings/DeletedEntriesSection";
import { paletteOf, toPayload } from "@/lib/palette";
import { BILLING_CYCLE_LABEL } from "@/lib/labels";
import type { TagFacet } from "@/lib/types";
import type {
  CompanyDictionary,
  FacetCount,
  FacetsResponse,
  MemberDevice,
  MemberEmulator,
  MemberInputMethod,
  MemberPlatform,
  MeResponse,
  PlatformAccountRef,
  Subscription,
} from "@/lib/types";

type Dialog =
  | null
  | { kind: "profile" }
  | { kind: "memo" }
  | { kind: "platform"; edit?: MemberPlatform }
  | { kind: "account"; edit?: PlatformAccountRef }
  | { kind: "device"; edit?: MemberDevice }
  | { kind: "emulator"; edit?: MemberEmulator }
  | { kind: "inputMethod"; edit?: MemberInputMethod }
  | { kind: "subscription"; edit?: Subscription };

/**
 * 프로필 · 선택지 다섯 종 · 구독 · 사전 · 계정.
 *
 * 선택지(플랫폼·계정·기기·에뮬·입력 방식)는 전부 **내 소유**라 여기서 고치고 지운다.
 * 이름을 바꾸면 그 항목을 문 회차·취득이 전부 따라 바뀐다 — FK라 값을 복사해두지 않았다.
 *
 * 섹션마다 엔드포인트가 다르다 (쓰기는 리소스 단위, API 설계서 §0).
 * 읽기는 `/api/me` 하나가 전부 통째로 준다
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
    facets.reload();
    companies.reload();
  };

  if (me.error) return <ErrorNotice error={me.error} onRetry={me.reload} />;

  return (
    <main className="h-full overflow-y-auto">
      <div className="page-x page-top mx-auto w-full max-w-3xl pb-20">
        <PageHeading
          eyebrow="Settings"
          title="프로필 / 설정"
          subtitle="계정과 기록에 사용되는 정보를 관리하실 수 있습니다."
        />

        <div className="mt-8">
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
                {/*
                  이메일을 안 보여준다 (2026-08-28). 로그인이 없어진 v1.0에서 이 값은
                  `owner@starlog.local` — **주인 계정을 만들 때 채워 넣은 자리표시자**다.
                  아무 뜻도 없는 문자열을 프로필에 띄우면 "이게 뭐지"만 남는다
                */}
                <div className="text-sm font-medium">{me.data?.profile.nickname}</div>
              </div>
            )}
          </SettingsSection>

          {/*
            메모는 자유 서식이라 프로필 폼 한 줄로는 좁다.
            게임 메모와 같은 마크다운 렌더를 써서 보는 것과 쓰는 것을 가른다
          */}
          <SettingsSection
            collapsible
            title="메모"
            icon="note"
            description="게이밍 기어 스펙, 모딩 설정, 세팅값처럼 어디에도 안 들어가는 것들을 적어 두세요. 마크다운을 지원합니다."
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
            collapsible
            title="플랫폼"
            icon="account"
            description="Steam·PSN 등 게임을 구매하시는 곳입니다. 계정은 이 위에 매답니다."
            action={<Button onClick={() => setDialog({ kind: "platform" })}>추가</Button>}
          >
            <ul className="flex flex-col gap-2">
              {(me.data?.platforms ?? []).map((platform) => (
                <Row key={platform.platformId}>
                  <span className="flex-1">{platform.name}</span>
                  <EditButton onClick={() => setDialog({ kind: "platform", edit: platform })} />
                  <DeleteButton
                    path={`/api/me/platforms/${platform.platformId}`}
                    name={platform.name}
                    note="이 플랫폼의 계정도 함께 삭제됩니다."
                    onDone={refresh}
                  />
                </Row>
              ))}
              {me.data?.platforms.length === 0 && <EmptyRow>등록된 항목이 없습니다</EmptyRow>}
            </ul>
          </SettingsSection>

          <SettingsSection
            collapsible
            title="플랫폼 계정"
            icon="account"
            description="플랫폼별 계정입니다. 취득·회차 기록에서 선택하실 수 있습니다."
            action={<Button onClick={() => setDialog({ kind: "account" })}>추가</Button>}
          >
            <ul className="flex flex-col gap-2">
              {(me.data?.platformAccounts ?? []).map((account) => (
                <Row key={account.accountId}>
                  {/*
                    **플랫폼이 먼저다** (2026-08-29). 라벨이 "Beene"으로 다 같은 경우가 흔해서
                    뒤에 붙이면 목록이 같은 이름 여러 줄로 보인다 — 왼쪽 정렬된 플랫폼을
                    먼저 훑게 두면 그 문제가 사라진다
                  */}
                  <span className="flex flex-1 items-center gap-2">
                    <span className="rounded border border-white/12 px-1.5 py-0.5 text-[10px] tracking-wide text-white/55">
                      {/* 소속은 플랫폼이거나 에뮬이거나 — 채워진 쪽을 그린다 (v1.1) */}
                      {account.platform?.name ?? account.emulator?.name}
                    </span>
                    <span>{account.label}</span>
                  </span>
                  <EditButton onClick={() => setDialog({ kind: "account", edit: account })} />
                  <DeleteButton
                    path={`/api/me/platform-accounts/${account.accountId}`}
                    name={account.label}
                    onDone={refresh}
                  />
                </Row>
              ))}
              {me.data?.platformAccounts.length === 0 && <EmptyRow>등록된 항목이 없습니다</EmptyRow>}
            </ul>
          </SettingsSection>

          <SettingsSection
            collapsible
            title="보유 기기"
            icon="device"
            description="회차 기록에서 선택하실 수 있습니다. 같은 기종을 여러 대 두시려면 라벨로 구분해 주세요."
            action={<Button onClick={() => setDialog({ kind: "device" })}>추가</Button>}
          >
            <ul className="flex flex-col gap-2">
              {(me.data?.devices ?? []).map((device) => (
                <CatalogRow key={device.deviceId} memo={device.memo}>
                  <span className="flex-1">{device.label}</span>
                  <span className="text-xs text-white/40">{device.deviceType}</span>
                  <EditButton onClick={() => setDialog({ kind: "device", edit: device })} />
                  <DeleteButton
                    path={`/api/me/devices/${device.deviceId}`}
                    name={device.label}
                    onDone={refresh}
                  />
                </CatalogRow>
              ))}
              {me.data?.devices.length === 0 && <EmptyRow>등록된 항목이 없습니다</EmptyRow>}
            </ul>
          </SettingsSection>

          <SettingsSection
            collapsible
            title="에뮬레이터"
            icon="device"
            description="설정값이나 주의점을 메모로 남기실 수 있습니다."
            action={<Button onClick={() => setDialog({ kind: "emulator" })}>추가</Button>}
          >
            <ul className="flex flex-col gap-2">
              {(me.data?.emulators ?? []).map((emulator) => (
                <CatalogRow key={emulator.emulatorId} memo={emulator.memo}>
                  <span className="flex-1">{emulator.name}</span>
                  <EditButton onClick={() => setDialog({ kind: "emulator", edit: emulator })} />
                  <DeleteButton
                    path={`/api/me/emulators/${emulator.emulatorId}`}
                    name={emulator.name}
                    onDone={refresh}
                  />
                </CatalogRow>
              ))}
              {me.data?.emulators.length === 0 && <EmptyRow>등록된 항목이 없습니다</EmptyRow>}
            </ul>
          </SettingsSection>

          <SettingsSection
            collapsible
            title="입력 방식"
            icon="device"
            description="회차 기록에서 어떤 컨트롤러로 플레이하셨는지 남기실 때 사용됩니다."
            action={<Button onClick={() => setDialog({ kind: "inputMethod" })}>추가</Button>}
          >
            <ul className="flex flex-col gap-2">
              {(me.data?.inputMethods ?? []).map((inputMethod) => (
                <Row key={inputMethod.inputMethodId}>
                  <span className="flex-1">{inputMethod.name}</span>
                  <EditButton
                    onClick={() => setDialog({ kind: "inputMethod", edit: inputMethod })}
                  />
                  <DeleteButton
                    path={`/api/me/input-methods/${inputMethod.inputMethodId}`}
                    name={inputMethod.name}
                    onDone={refresh}
                  />
                </Row>
              ))}
              {me.data?.inputMethods.length === 0 && <EmptyRow>등록된 항목이 없습니다</EmptyRow>}
            </ul>
          </SettingsSection>

          <SettingsSection
            collapsible
            title="구독"
            icon="subscription"
            description="지출 통계에 월 단위로 반영됩니다."
            action={<Button onClick={() => setDialog({ kind: "subscription" })}>추가</Button>}
          >
            <ul className="flex flex-col gap-2">
              {(me.data?.subscriptions ?? []).map((subscription) => (
                <Row key={subscription.subscriptionId}>
                  {/*
                    구독만 한 줄에 담을 게 많다(이름 + 요금 + 주기 + 기간).
                    폰에서 다 나란히 두면 이름 칸이 밀려 **한 글자씩 세로로 쪼개진다**.
                    이름과 나머지를 묶어서 좁을 때는 두 줄로 접는다
                  */}
                  <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                    <span className="truncate">{subscription.serviceName}</span>
                    <span className="num flex flex-wrap items-center gap-x-2 text-xs text-white/50">
                      <span>
                        <MoneyText money={subscription.fee} /> / {BILLING_CYCLE_LABEL[subscription.billingCycle]}
                      </span>
                      <span className="text-white/30">
                        {subscription.startedOn} ~ {subscription.endedOn ?? ""}
                      </span>
                    </span>
                  </div>
                  <EditButton
                    onClick={() => setDialog({ kind: "subscription", edit: subscription })}
                  />
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
            collapsible
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
                reorderable
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


          {/*
            "데이터 옮기기"는 **시스템 → 앱 설정**으로 갔다 (2026-08-28).
            세이브파일과 데이터베이스를 오가는 일은 프로필(내 이름·배경색)이 아니라
            앱 층위다 — 이 화면에 있으면 "내 프로필을 옮긴다"처럼 읽힌다
          */}

          {/*
            **맨 아래다.** 되살리기·완전 삭제는 자주 쓰는 기능이 아니고, 위에 두면
            설정을 열 때마다 "삭제한 게임"이 먼저 눈에 들어온다.
            삭제한 게 없으면 스스로 아무것도 안 그린다
          */}
          <DeletedEntriesSection />
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
      {dialog?.kind === "platform" && (
        <NameDialog
          title="플랫폼"
          hint="예) Steam, PlayStation"
          basePath="/api/me/platforms"
          edit={dialog.edit && { id: dialog.edit.platformId, name: dialog.edit.name }}
          onClose={() => setDialog(null)}
          onSaved={refresh}
        />
      )}
      {dialog?.kind === "inputMethod" && (
        <NameDialog
          title="입력 방식"
          hint="예) 듀얼센스, 키보드 & 마우스"
          basePath="/api/me/input-methods"
          edit={dialog.edit && { id: dialog.edit.inputMethodId, name: dialog.edit.name }}
          onClose={() => setDialog(null)}
          onSaved={refresh}
        />
      )}
      {dialog?.kind === "account" && (
        <AccountDialog
          emulators={me.data?.emulators ?? []}
          platforms={me.data?.platforms ?? []}
          edit={dialog.edit}
          onClose={() => setDialog(null)}
          onSaved={refresh}
        />
      )}
      {dialog?.kind === "device" && (
        <DeviceDialog edit={dialog.edit} onClose={() => setDialog(null)} onSaved={refresh} />
      )}
      {dialog?.kind === "emulator" && (
        <EmulatorDialog edit={dialog.edit} onClose={() => setDialog(null)} onSaved={refresh} />
      )}
      {dialog?.kind === "subscription" && (
        <SubscriptionDialog edit={dialog.edit} onClose={() => setDialog(null)} onSaved={refresh} />
      )}
    </main>
  );
}

function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 text-xs text-white/30 transition-colors hover:text-white/70"
    >
      수정
    </button>
  );
}

/** 메모가 있는 선택지(기기·에뮬)의 행. 스펙을 접어두지 않고 그 자리에서 보여준다 */
function CatalogRow({ memo, children }: { memo: string | null; children: React.ReactNode }) {
  return (
    <li className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm">
      <div className="flex items-center gap-3">{children}</div>
      {memo && (
        <div className="markdown mt-2 border-t border-white/10 pt-2 text-xs leading-relaxed font-light text-white/55">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{memo}</ReactMarkdown>
        </div>
      )}
    </li>
  );
}

/**
 * 삭제 확인. 예전에는 누르는 즉시 지워져서 되돌릴 방법도 안내도 없었다.
 *
 * 선택지 다섯 종은 전부 **소프트 삭제**다 (§7.4) — 회차·취득이 참조하고 있어서
 * 행을 지우면 "무엇으로 플레이했는지"가 과거 기록에서 통째로 사라진다.
 * 그래서 문구도 하나로 모였다: 지난 기록에는 남고, 같은 이름으로 다시 추가하면 돌아온다
 */
function DeleteButton({
  path,
  name,
  note,
  onDone,
}: {
  path: string;
  name: string;
  note?: string;
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
            <>
              <b className="text-white">{name}</b>을(를) 목록에서 뺍니다. 과거 회차·취득 기록에는
              이름이 그대로 남습니다.
              {note && (
                <>
                  <br />
                  {note}
                </>
              )}
              <br />
              나중에 같은 이름으로 다시 추가하시면{" "}
              <b className="text-white">그대로 돌아옵니다.</b>
            </>
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
  reorderable,
}: {
  label: string;
  items: FacetCount[];
  basePath: string;
  onDone: () => void;
  /**
   * 드래그로 순서를 바꿀 수 있나 (v1.1). 태그만 켠다 —
   * **이 순서를 라이브러리 사이드바와 폴더 탭이 그대로 따르기 때문**이다.
   * 장르는 따라가는 화면이 없어 순서에 뜻이 없다
   */
  reorderable?: boolean;
}) {
  const [editing, setEditing] = useState<FacetCount | null>(null);
  const [removing, setRemoving] = useState<FacetCount | null>(null);
  /**
   * 순서 바꾸기 — **끌고 있는 동안 실시간으로 자리가 바뀐다** (v1.2).
   *
   * 예전엔 놓아야만 순서가 바뀌어서 "지금 놓으면 어디로 가는지"를 알 수 없었다.
   * 이제 지나가는 항목마다 목록을 즉시 재배열한다 — 손에 든 것이 흐려진 채로
   * 그 자리에 서 있으므로 미리보기가 따로 필요 없다.
   *
   * ⚠️ **`dragId`를 ref로도 들고 있는다.** `dragover`는 초당 수십 번 오는데
   * 상태만 쓰면 그 사이 렌더가 밀려 옛 값을 읽는다.
   *
   * ⚠️ **드롭 후 `onDone()`을 부르지 않는다.** 부르면 서버에서 목록을 다시 받아
   * **옛 순서가 한 번 스쳤다가** 제자리로 온다(사용자가 본 그 깜빡임이다).
   * 우리가 이미 맞는 순서를 들고 있으므로 그대로 두면 된다
   */
  const [order, setOrder] = useState<FacetCount[] | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);
  const shown = order ?? items;

  /* 바깥에서 목록이 바뀌면(이름 변경·삭제) 내 사본을 버린다 */
  const itemKey = items.map((i) => i.id).join(",");
  const [seenKey, setSeenKey] = useState(itemKey);
  if (seenKey !== itemKey) {
    setSeenKey(itemKey);
    setOrder(null);
  }

  /**
   * 놓을 자리를 **포인터 좌표로 정한다** (v1.2).
   *
   * ⚠️ 예전엔 칩 위에 얹혔을 때만 자리를 바꿨다. 양쪽 정렬로 **칩 사이가 넓어지면서**
   * 그 틈에 놓으면 아무 일도 안 일어났다 — 사용자 눈에는 "사이에 두려는데 안 먹는다"다.
   *
   * 컨테이너가 통째로 받고, **각 칩의 가로 중심과 포인터를 견줘** 앞인지 뒤인지 정한다.
   * 줄이 여러 개라 세로도 본다 — 같은 줄(세로 범위 안)에 있는 것만 후보다
   */
  const listRef = useRef<HTMLDivElement>(null);

  const hoverAt = (x: number, y: number) => {
    const from = dragRef.current;
    if (from == null || !listRef.current) return;

    const chips = [...listRef.current.querySelectorAll<HTMLElement>("[data-chip]")];
    let targetId: number | null = null;
    let after = false;

    for (const chip of chips) {
      const r = chip.getBoundingClientRect();
      if (y < r.top || y > r.bottom) continue;   // 다른 줄
      targetId = Number(chip.dataset.chip);
      after = x > r.left + r.width / 2;
      if (!after) break;                          // 이 칩 앞이면 여기서 끝
    }
    if (targetId == null || targetId === from) return;

    setOrder((prev) => {
      const list = prev ?? items;
      const a = list.findIndex((i) => i.id === from);
      let b = list.findIndex((i) => i.id === targetId);
      if (a < 0 || b < 0) return prev;
      if (after) b += 1;
      if (b > a) b -= 1;                          // 자기를 뺀 뒤의 자리
      if (a === b) return prev;
      const next = [...list];
      next.splice(b, 0, ...next.splice(a, 1));
      return next;
    });
  };

  /**
   * 저장하는 동안에는 **드래그를 막는다** (사용자 결정 2026-08-29).
   *
   * ⚠️ 빠르게 여러 번 옮기면 PUT이 겹쳐 **먼저 보낸 옛 순서가 나중에 도착**했다 —
   * 마지막 수정이 사라진 것처럼 보였다.
   *
   * 큐로 마지막 것만 보내는 방법도 있지만, 그러면 **화면에 보이는 순서와 서버의 순서가
   * 잠깐 어긋난 채로 또 끌 수 있다.** 짧게 막는 쪽이 "지금 무엇이 참인가"가 분명하다
   */
  const [saving, setSaving] = useState(false);

  const finish = async () => {
    const moved = dragRef.current;
    dragRef.current = null;
    setDragId(null);
    /*
     * 순서가 그대로면 아무것도 안 보낸다 — 짚었다 그냥 놓는 일이 잦다.
     * 이게 없으면 손만 댔다 떼도 서버 왕복이 일어난다
     */
    if (moved == null || !order) return;
    const same = order.every((item, i) => item.id === items[i]?.id);
    if (same) {
      setOrder(null);
      return;
    }
    setSaving(true);
    try {
      await api.put(`${basePath}/order`, { tagIds: order.map((i) => i.id) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[10px] font-semibold tracking-widest text-white/35 uppercase">
          {label}
        </span>
        <span className="num text-[10px] text-white/25">{items.length}</span>
        {reorderable && items.length > 1 && (
          <span className="text-[10px] text-white/20">
            {saving ? "저장 중…" : "끌어서 순서 변경"}
          </span>
        )}

      </div>

      {shown.length === 0 ? (
        <p className="text-xs text-white/25">사용 중인 항목이 없습니다. 게임에 지정하시면 이곳에 표시됩니다.</p>
      ) : (
        /*
          ⚠️ **글자 양쪽 정렬처럼** 편다 (v1.2, 사용자 지정).
          격자로 폭을 균등하게 나눠봤더니 짧은 태그가 쓸데없이 넓어졌다 —
          원한 것은 **칸을 늘리는 게 아니라 사이를 벌리는 것**이다.
          `text-align: justify`는 인라인 요소에 먹으므로 칩을 `inline-flex`로 둔다.

          ⚠️ **`::after` 트릭을 쓰지 않는다.** 그건 마지막 줄까지 억지로 펴는 장치인데,
          그러면 태그가 두 개 남은 줄이 화면 폭만큼 벌어져 보인다 —
          justify는 원래 마지막 줄을 왼쪽 정렬로 둔다. 그게 맞는 모양이다 (사용자 지정)
        */
        <div
          ref={listRef}
          onDragOver={(e) => {
            if (!reorderable || dragRef.current == null) return;
            e.preventDefault();
            hoverAt(e.clientX, e.clientY);
          }}
          onDrop={(e) => {
            e.preventDefault();
            void finish();
          }}
          className="text-justify"
        >
          {/*
            ⚠️ **칩 사이에 진짜 공백을 넣는다.** JSX는 요소 사이의 줄바꿈을 지우는데,
            `text-align: justify`는 **단어 사이 공백을 늘려서** 줄을 편다 —
            공백이 없으면 늘릴 것이 없어 아무 일도 안 일어난다
          */}
          {shown.map((item) => (
            <Fragment key={item.id}>
            <span
              /* ⚠️ 놓을 자리를 이 표식으로 찾는다 — 없으면 드래그가 통째로 죽는다 */
              data-chip={item.id}
              draggable={reorderable && !saving}
              onDragStart={() => {
                dragRef.current = item.id;
                setDragId(item.id);
              }}
              /* 끌기가 어떻게 끝나든 흐린 상태를 반드시 푼다 — 취소해도 온다 */
              onDragEnd={() => void finish()}
              /* 색이 있으면 칩 전체가 그 톤을 입는다 — 사이드바·폴더와 같은 색이다 */
              style={
                "color" in item && (item as TagFacet).color
                  ? {
                      color: toneOf((item as TagFacet).color).text,
                      background: toneOf((item as TagFacet).color).soft,
                      borderColor: toneOf((item as TagFacet).color).soft,
                    }
                  : undefined
              }
              className={`mb-1.5 inline-flex items-center gap-2 rounded-full border py-1 pr-1.5 pl-2.5 text-left align-middle text-xs ${
                "color" in item && (item as TagFacet).color ? "" : "text-white/70"
              } ${
                !reorderable ? "" : saving ? "cursor-wait opacity-60" : "cursor-grab active:cursor-grabbing"
              } ${
                dragId === item.id
                  ? "border-white/40 bg-white/15 opacity-60"
                  : "border-white/10 bg-white/5"
              }`}
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
            </span>{" "}
            </Fragment>
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

      </div>

      {names.length === 0 ? (
        <p className="text-xs text-white/25">직접 입력하신 값이 없습니다. 게임 상세에서 수정하시면 이곳에 표시됩니다.</p>
      ) : (
        /*
          ⚠️ **글자 양쪽 정렬처럼** 편다 (v1.2, 사용자 지정).
          격자로 폭을 균등하게 나눠봤더니 짧은 태그가 쓸데없이 넓어졌다 —
          원한 것은 **칸을 늘리는 게 아니라 사이를 벌리는 것**이다.
          `text-align: justify`는 인라인 요소에 먹으므로 칩을 `inline-flex`로 둔다.

          ⚠️ **`::after` 트릭을 쓰지 않는다.** 그건 마지막 줄까지 억지로 펴는 장치인데,
          그러면 태그가 두 개 남은 줄이 화면 폭만큼 벌어져 보인다 —
          justify는 원래 마지막 줄을 왼쪽 정렬로 둔다. 그게 맞는 모양이다 (사용자 지정)
        */
        <div className="text-justify">
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
  /** 색은 태그에만 있다. 장르·기기에는 자리 자체를 안 만든다 */
  const colorable = basePath.endsWith("/tags");
  const [color, setColor] = useState<string | null>(
    colorable ? ((item as TagFacet).color ?? null) : null,
  );

  return (
    <FormDialog
      title={colorable ? "태그 수정" : "이름 바꾸기"}
      onClose={onClose}
      onSubmit={async () => {
        await api.put(`${basePath}/${item.id}`, { name });
        /*
         * 색은 엔드포인트가 따로다 — 이름은 담긴 항목까지 파급이 있고 색은 표시뿐이라
         * 성질이 다르다. 안 바뀌었으면 부르지 않는다
         */
        if (colorable && color !== ((item as TagFacet).color ?? null)) {
          await api.put(`${basePath}/${item.id}/color`, { color });
        }
        onSaved();
      }}
    >
      <p className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-[11px] leading-relaxed text-white/45">
        적용 중인 <b className="text-white/75">{item.count}개 항목</b>에 일괄 반영됩니다.
      </p>
      {colorable && (
        <Field label="Color" hint="라이브러리의 사이드바와 폴더에 이 색이 쓰입니다">
          {/*
          ⚠️ **격자로 바꿨다** (v1.2, 사용자 지적). `flex-wrap`은 칩 폭이 글자 수를 따라가서
          줄마다 끝이 들쭉날쭉했다 — 색을 입히고 나니 그 지저분함이 더 도드라졌다.
          `auto-fill`은 폭이 남으면 칸을 더 만들고, 모자라면 줄을 바꾼다. 어느 폭에서도
          **오른쪽 끝이 가지런하다**
        */}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-1.5">
            {/* 색 없음 — 지금까지의 중립 회색 */}
            <button
              type="button"
              onClick={() => setColor(null)}
              aria-label="색 없음"
              className={`h-7 w-7 rounded-full border-2 bg-white/10 transition-transform ${
                color === null ? "scale-110 border-white" : "border-transparent hover:scale-105"
              }`}
            />
            {TAG_COLOR_NAMES.map((name_) => (
              <button
                key={name_}
                type="button"
                onClick={() => setColor(name_)}
                aria-label={TAG_COLORS[name_].label}
                title={TAG_COLORS[name_].label}
                style={{ background: TAG_COLORS[name_].text }}
                className={`h-7 w-7 rounded-full border-2 transition-transform ${
                  color === name_ ? "scale-110 border-white" : "border-transparent hover:scale-105"
                }`}
              />
            ))}
          </div>
        </Field>
      )}

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
  // 아직 저장 안 한 값이다. 취소하면 그냥 버려진다 — 그래서 상태의 주인이 여기 하나여야 한다
  const [colors, setColors] = useState(() => [...paletteOf(profile.backgroundColors)]);

  return (
    <FormDialog
      title={field === "nickname" ? "프로필" : "메모"}
      onClose={onClose}
      onSubmit={async () => {
        await api.put("/api/me/profile", {
          nickname,
          memo: memo.trim() || null,
          // 기본값과 같으면 빈 문자열 → 서버가 null로 되돌린다 ("안 고름")
          backgroundColors: toPayload(colors),
        });
        /*
         * 세션까지 다시 받는다. onSaved()는 이 화면의 useApi만 새로 고치는데,
         * **배경은 세션 스토어를 본다** — 이게 없으면 새로고침 전까지 옛 색으로 남는다
         */
        await refreshSession();
        onSaved();
      }}
    >
      {field === "nickname" ? (
        <>
          <Field label="Nickname">
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              maxLength={30}
              className={FIELD_INPUT}
            />
          </Field>

          <Field
            label="Background"
            hint="고르는 즉시 위 창에 반영됩니다 · 저장을 눌러야 실제로 바뀝니다"
            // 색 선택기가 다섯이라 label로 감싸면 빈 곳 클릭이 첫 칸(기조)을 연다
            composite
          >
            <PaletteEditor colors={colors} onChange={setColors} />
          </Field>
        </>
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
/** 이름 하나뿐인 선택지(플랫폼·입력 방식)의 추가·수정 */
function NameDialog({
  title,
  hint,
  basePath,
  edit,
  onClose,
  onSaved,
}: {
  title: string;
  hint: string;
  basePath: string;
  edit?: { id: number; name: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(edit?.name ?? "");

  return (
    <FormDialog
      title={edit ? `${title} 수정` : `${title} 추가`}
      onClose={onClose}
      onSubmit={async () => {
        if (edit) await api.put(`${basePath}/${edit.id}`, { name });
        else await api.post(basePath, { name });
        onSaved();
      }}
    >
      {edit && <BulkChangeNotice />}
      <Field label="Name" hint={hint}>
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

/** 이름을 바꾸면 FK를 타고 과거 기록까지 전부 따라 바뀐다. 그걸 미리 알려준다 */
function BulkChangeNotice() {
  return (
    <p className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-[11px] leading-relaxed text-white/45">
      이름을 바꾸시면 이 항목을 사용한 <b className="text-white/75">모든 기록에 함께 반영</b>됩니다.
    </p>
  );
}

/**
 * 플랫폼 계정 추가·수정.
 *
 * 되살리기를 **되묻는 유일한 선택지다.** 나머지 넷은 같은 이름으로 다시 추가하면 조용히
 * 되살아나는데, 계정은 취득 기록(구매 이력)까지 물고 있어서 사용자가 알고 되살리는 편이 낫다 (§7.4).
 * 예전에는 안내만 하고 버튼이 없어 아무것도 할 수 없었다
 */
function AccountDialog({
  platforms,
  emulators,
  edit,
  onClose,
  onSaved,
}: {
  platforms: MemberPlatform[];
  /** 에뮬레이터에도 계정이 있는 경우가 있다 (v1.1) */
  emulators: MemberEmulator[];
  edit?: PlatformAccountRef;
  onClose: () => void;
  onSaved: () => void;
}) {
  /** 소속이 플랫폼인가 에뮬인가. 수정할 때는 이미 정해져 있어 바꿀 수 없다 */
  const [ownerKind, setOwnerKind] = useState<"platform" | "emulator">(
    edit?.emulator ? "emulator" : "platform",
  );
  const [platformId, setPlatformId] = useState(edit?.platform ? String(edit.platform.id) : "");
  const [emulatorId, setEmulatorId] = useState(edit?.emulator ? String(edit.emulator.id) : "");
  const [label, setLabel] = useState(edit?.label ?? "");
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
      title={edit ? "플랫폼 계정 수정" : "플랫폼 계정 추가"}
      onClose={onClose}
      onSubmit={async () => {
        if (edit) {
          await api.put(`/api/me/platform-accounts/${edit.accountId}`, { accountLabel: label });
          onSaved();
          return;
        }
        try {
          await api.post("/api/me/platform-accounts", {
            // 고르지 않은 쪽은 안 보낸다 — 서버가 "하나만"을 검사한다
            platformId: ownerKind === "platform" ? Number(platformId) : null,
            emulatorId: ownerKind === "emulator" ? Number(emulatorId) : null,
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
      {edit && <BulkChangeNotice />}
      {/*
        소속 토글 (v1.1). 수정할 때는 안 보인다 — 소속을 바꾸면 유니크 키가 통째로
        달라져서 "옮기기"가 아니라 "새로 만들기"가 된다
      */}
      {!edit && (
        <div className="mb-1 flex gap-1">
          {(["platform", "emulator"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => setOwnerKind(kind)}
              className={`rounded px-2.5 py-1 text-[10px] tracking-widest uppercase transition-colors ${
                ownerKind === kind
                  ? "bg-white/15 text-white"
                  : "text-white/35 hover:bg-white/8 hover:text-white/70"
              }`}
            >
              {kind === "platform" ? "플랫폼" : "에뮬레이터"}
            </button>
          ))}
        </div>
      )}

      {ownerKind === "emulator" ? (
        <Field
          label="Emulator"
          hint={edit ? "소속은 바꿀 수 없습니다. 새 계정을 추가해 주세요" : undefined}
        >
          <select
            value={emulatorId}
            onChange={(event) => setEmulatorId(event.target.value)}
            disabled={Boolean(edit)}
            className={FIELD_SELECT}
          >
            <option value="">선택</option>
            {emulators.map((emulator) => (
              <option key={emulator.emulatorId} value={emulator.emulatorId}>
                {emulator.name}
              </option>
            ))}
          </select>
        </Field>
      ) : (
      <Field
        label="Platform"
        hint={edit ? "플랫폼은 바꿀 수 없습니다. 새 계정을 추가해 주세요" : undefined}
      >
        <select
          value={platformId}
          onChange={(event) => setPlatformId(event.target.value)}
          disabled={Boolean(edit)}
          className={FIELD_SELECT}
        >
          <option value="">선택</option>
          {platforms.map((platform) => (
            <option key={platform.platformId} value={platform.platformId}>
              {platform.name}
            </option>
          ))}
        </select>
      </Field>
      )}
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

/** 기기는 마스터에서 고르는 게 아니라 유형·라벨을 직접 적는다 */
function DeviceDialog({
  edit,
  onClose,
  onSaved,
}: {
  edit?: MemberDevice;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [deviceType, setDeviceType] = useState(edit?.deviceType ?? "");
  const [label, setLabel] = useState(edit?.label ?? "");
  const [memo, setMemo] = useState(edit?.memo ?? "");

  return (
    <FormDialog
      title={edit ? "기기 수정" : "기기 추가"}
      onClose={onClose}
      onSubmit={async () => {
        const body = { deviceType, label, memo: memo.trim() || null };
        if (edit) await api.put(`/api/me/devices/${edit.deviceId}`, body);
        else await api.post("/api/me/devices", body);
        onSaved();
      }}
    >
      {edit && <BulkChangeNotice />}
      <Field label="Type" hint="예) Windows PC, Nintendo Switch">
        <input
          value={deviceType}
          onChange={(event) => setDeviceType(event.target.value)}
          maxLength={50}
          className={FIELD_INPUT}
        />
      </Field>
      <Field label="Label" hint="같은 기종을 여러 대 두실 때 구분하는 이름입니다. 예) 거실 스위치">
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          maxLength={50}
          className={FIELD_INPUT}
        />
      </Field>
      <Field label="Memo" hint="스펙·주의점 · 마크다운 · Enter로 목록 이어쓰기, Tab으로 들여쓰기">
        <MarkdownTextarea value={memo} onChange={setMemo} rows={6} maxLength={2000} />
      </Field>
    </FormDialog>
  );
}

function EmulatorDialog({
  edit,
  onClose,
  onSaved,
}: {
  edit?: MemberEmulator;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(edit?.name ?? "");
  const [memo, setMemo] = useState(edit?.memo ?? "");

  return (
    <FormDialog
      title={edit ? "에뮬레이터 수정" : "에뮬레이터 추가"}
      onClose={onClose}
      onSubmit={async () => {
        const body = { name, memo: memo.trim() || null };
        if (edit) await api.put(`/api/me/emulators/${edit.emulatorId}`, body);
        else await api.post("/api/me/emulators", body);
        onSaved();
      }}
    >
      {edit && <BulkChangeNotice />}
      <Field label="Name" hint="예) Ryujinx, Azahar">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={50}
          className={FIELD_INPUT}
        />
      </Field>
      <Field label="Memo" hint="설정값·주의점 · 마크다운">
        <MarkdownTextarea value={memo} onChange={setMemo} rows={6} maxLength={2000} />
      </Field>
    </FormDialog>
  );
}

/**
 * 구독 추가·수정.
 *
 * 예전엔 추가와 삭제만 있어서 **요금이 바뀌면 지우고 다시 만들어야 했다** —
 * 그러면 그 구독에 걸린 취득 기록의 연결이 끊긴다. 백엔드 PUT은 진작 있었다
 */
function SubscriptionDialog({
  edit,
  onClose,
  onSaved,
}: {
  edit?: Subscription;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [serviceName, setServiceName] = useState(edit?.serviceName ?? "");
  const [startedOn, setStartedOn] = useState(edit?.startedOn ?? "");
  const [endedOn, setEndedOn] = useState(edit?.endedOn ?? "");
  const [amount, setAmount] = useState(edit?.fee ? String(edit.fee.amount) : "");
  const [currency, setCurrency] = useState<string>(edit?.fee?.currency ?? "KRW");
  const [billingCycle, setBillingCycle] = useState<string>(edit?.billingCycle ?? "MONTHLY");

  return (
    <FormDialog
      title={edit ? "구독 수정" : "구독 추가"}
      onClose={onClose}
      onSubmit={async () => {
        const body = {
          serviceName,
          startedOn,
          endedOn: endedOn || null,
          fee: amount ? { amount: Number(amount), currency } : null,
          billingCycle,
        };
        if (edit) await api.put(`/api/me/subscriptions/${edit.subscriptionId}`, body);
        else await api.post("/api/me/subscriptions", body);
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
        <Field label="Started" composite>
          <DateField value={startedOn} onChange={setStartedOn} />
        </Field>
        <Field label="Ended" hint="비우면 구독 중" composite>
          <DateField value={endedOn} onChange={setEndedOn} />
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

"use client";

import SettingsSection, { EmptyRow, Row } from "@/components/settings/SettingsSection";
import { CatalogRow, DeleteButton, EditButton } from "@/components/settings/CatalogRows";
import type { SettingsDialog } from "@/components/settings/settingsDialog";
import { Button } from "@/components/ui/Field";
import MoneyText from "@/components/ui/Money";
import { BILLING_CYCLE_LABEL } from "@/lib/labels";
import type { MeResponse } from "@/lib/types";

/** 선택지 섹션이 공유하는 props — 읽기는 `/api/me` 통째, 쓰기 뒤에는 `onDone`으로 새로 고친다 */
interface Props {
  data: MeResponse | null;
  onOpen: (dialog: SettingsDialog) => void;
  onDone: () => void;
}

export function PlatformsSection({ data, onOpen, onDone }: Props) {
  return (
    <SettingsSection
      collapsible
      title="플랫폼"
      icon="account"
      description="Steam·PSN 등 게임을 구매하시는 곳입니다. 계정은 이 위에 매답니다."
      action={<Button onClick={() => onOpen({ kind: "platform" })}>추가</Button>}
    >
      <ul className="flex flex-col gap-2">
        {(data?.platforms ?? []).map((platform) => (
          <Row key={platform.platformId}>
            <span className="flex-1">{platform.name}</span>
            <EditButton onClick={() => onOpen({ kind: "platform", edit: platform })} />
            <DeleteButton
              path={`/api/me/platforms/${platform.platformId}`}
              name={platform.name}
              note="이 플랫폼의 계정도 함께 삭제됩니다."
              onDone={onDone}
            />
          </Row>
        ))}
        {data?.platforms.length === 0 && <EmptyRow>등록된 항목이 없습니다</EmptyRow>}
      </ul>
    </SettingsSection>
  );
}

export function AccountsSection({ data, onOpen, onDone }: Props) {
  return (
    <SettingsSection
      collapsible
      title="플랫폼 계정"
      icon="account"
      description="플랫폼별 계정입니다. 취득·회차 기록에서 선택하실 수 있습니다."
      action={<Button onClick={() => onOpen({ kind: "account" })}>추가</Button>}
    >
      <ul className="flex flex-col gap-2">
        {(data?.platformAccounts ?? []).map((account) => (
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
            <EditButton onClick={() => onOpen({ kind: "account", edit: account })} />
            <DeleteButton
              path={`/api/me/platform-accounts/${account.accountId}`}
              name={account.label}
              onDone={onDone}
            />
          </Row>
        ))}
        {data?.platformAccounts.length === 0 && <EmptyRow>등록된 항목이 없습니다</EmptyRow>}
      </ul>
    </SettingsSection>
  );
}

export function DevicesSection({ data, onOpen, onDone }: Props) {
  return (
    <SettingsSection
      collapsible
      title="보유 기기"
      icon="device"
      description="회차 기록에서 선택하실 수 있습니다. 같은 기종을 여러 대 두시려면 라벨로 구분해 주세요."
      action={<Button onClick={() => onOpen({ kind: "device" })}>추가</Button>}
    >
      <ul className="flex flex-col gap-2">
        {(data?.devices ?? []).map((device) => (
          <CatalogRow key={device.deviceId} memo={device.memo}>
            <span className="flex-1">{device.label}</span>
            <span className="text-xs text-white/40">{device.deviceType}</span>
            <EditButton onClick={() => onOpen({ kind: "device", edit: device })} />
            <DeleteButton
              path={`/api/me/devices/${device.deviceId}`}
              name={device.label}
              onDone={onDone}
            />
          </CatalogRow>
        ))}
        {data?.devices.length === 0 && <EmptyRow>등록된 항목이 없습니다</EmptyRow>}
      </ul>
    </SettingsSection>
  );
}

export function EmulatorsSection({ data, onOpen, onDone }: Props) {
  return (
    <SettingsSection
      collapsible
      title="에뮬레이터"
      icon="device"
      description="설정값이나 주의점을 메모로 남기실 수 있습니다."
      action={<Button onClick={() => onOpen({ kind: "emulator" })}>추가</Button>}
    >
      <ul className="flex flex-col gap-2">
        {(data?.emulators ?? []).map((emulator) => (
          <CatalogRow key={emulator.emulatorId} memo={emulator.memo}>
            <span className="flex-1">{emulator.name}</span>
            <EditButton onClick={() => onOpen({ kind: "emulator", edit: emulator })} />
            <DeleteButton
              path={`/api/me/emulators/${emulator.emulatorId}`}
              name={emulator.name}
              onDone={onDone}
            />
          </CatalogRow>
        ))}
        {data?.emulators.length === 0 && <EmptyRow>등록된 항목이 없습니다</EmptyRow>}
      </ul>
    </SettingsSection>
  );
}

export function InputMethodsSection({ data, onOpen, onDone }: Props) {
  return (
    <SettingsSection
      collapsible
      title="입력 방식"
      icon="device"
      description="회차 기록에서 어떤 컨트롤러로 플레이하셨는지 남기실 때 사용됩니다."
      action={<Button onClick={() => onOpen({ kind: "inputMethod" })}>추가</Button>}
    >
      <ul className="flex flex-col gap-2">
        {(data?.inputMethods ?? []).map((inputMethod) => (
          <Row key={inputMethod.inputMethodId}>
            <span className="flex-1">{inputMethod.name}</span>
            <EditButton
              onClick={() => onOpen({ kind: "inputMethod", edit: inputMethod })}
            />
            <DeleteButton
              path={`/api/me/input-methods/${inputMethod.inputMethodId}`}
              name={inputMethod.name}
              onDone={onDone}
            />
          </Row>
        ))}
        {data?.inputMethods.length === 0 && <EmptyRow>등록된 항목이 없습니다</EmptyRow>}
      </ul>
    </SettingsSection>
  );
}

export function SubscriptionsSection({ data, onOpen, onDone }: Props) {
  return (
    <SettingsSection
      collapsible
      title="구독"
      icon="subscription"
      description="지출 통계에 월 단위로 반영됩니다."
      action={<Button onClick={() => onOpen({ kind: "subscription" })}>추가</Button>}
    >
      <ul className="flex flex-col gap-2">
        {(data?.subscriptions ?? []).map((subscription) => (
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
              onClick={() => onOpen({ kind: "subscription", edit: subscription })}
            />
            <DeleteButton
              path={`/api/me/subscriptions/${subscription.subscriptionId}`}
              name={subscription.serviceName}
              onDone={onDone}
            />
          </Row>
        ))}
        {data?.subscriptions.length === 0 && <EmptyRow>등록된 항목이 없습니다</EmptyRow>}
      </ul>
    </SettingsSection>
  );
}

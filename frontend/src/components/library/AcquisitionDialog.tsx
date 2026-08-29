"use client";

import DateField from "@/components/ui/DateField";
import { useState } from "react";
import Modal from "@/components/ui/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { Button, Field, FIELD_INPUT, FIELD_SELECT } from "@/components/ui/Field";
import { api, errorMessage } from "@/lib/api";
import { ACQUISITION_METHOD_LABEL } from "@/lib/labels";
import { withCurrent } from "@/lib/options";
import type { Acquisition, AcquisitionMethod, Currency, OptionsResponse } from "@/lib/types";

const METHODS: AcquisitionMethod[] = [
  "PURCHASED", "SUBSCRIPTION", "FREE", "GIFT", "BORROWED", "DEMO", "NOT_OWNED",
];
const CURRENCIES: Currency[] = ["KRW", "USD", "JPY"];

/**
 * 취득 기록 추가·수정.
 *
 * 금액은 **통화와 한 쌍**이다 (Money가 ISO 4217). amount가 비면 금액 자체가 없는 것으로 본다.
 * 화면에 나오는 유일한 금액이 여기라, 정가가 아니라 **실제 지불액**을 넣는 자리다 (§8.1)
 */
export default function AcquisitionDialog({
  entryId,
  acquisition,
  options,
  onClose,
  onSaved,
}: {
  entryId: number;
  acquisition: Acquisition | null;
  options: OptionsResponse | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [method, setMethod] = useState<AcquisitionMethod>(acquisition?.method ?? "PURCHASED");
  const [platformId, setPlatformId] = useState(
    acquisition?.platform ? String(acquisition.platform.platformId) : "",
  );
  const [accountId, setAccountId] = useState(
    acquisition?.platformAccount ? String(acquisition.platformAccount.accountId) : "",
  );
  const [subscriptionId, setSubscriptionId] = useState(
    acquisition?.subscription ? String(acquisition.subscription.subscriptionId) : "",
  );
  const [amount, setAmount] = useState(acquisition?.price ? String(acquisition.price.amount) : "");
  const [currency, setCurrency] = useState<Currency>(acquisition?.price?.currency ?? "KRW");
  /** 구매일 때만 가격을 받는다 */
  const paid = method === "PURCHASED";
  const [acquiredOn, setAcquiredOn] = useState(acquisition?.acquiredOn ?? "");
  const [label, setLabel] = useState(acquisition?.label ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  /*
   * 계정은 **플랫폼의 하위**다. 예전엔 전체 계정을 그대로 늘어놨는데, 라벨이 "Beene"으로
   * 겹쳐서 어느 것이 스팀인지 알 수 없었다. 플랫폼을 고르면 그 아래 계정만 남긴다.
   *
   * 편집 중인 값은 소프트 삭제됐을 수 있어 withCurrent로 지켜준다 —
   * 목록에서 빠진 채 저장하면 원래 붙어 있던 계정이 조용히 날아간다 (lib/options.ts)
   */
  const accountChoices = withCurrent(
    (options?.platformAccounts ?? []).filter(
      (account) => String(account.platformId) === platformId,
    ),
    acquisition?.platformAccount && {
      id: acquisition.platformAccount.accountId,
      name: acquisition.platformAccount.label,
    },
  );

  /*
   * 플랫폼을 바꾸면 계정을 비운다. 안 그러면 "스팀 + 닌텐도 계정" 같은 모순이 저장된다 —
   * select에는 안 보이는데 상태에는 남아 있어서, 눈으로는 알아챌 수 없는 종류의 오류다
   */
  const changePlatform = (next: string) => {
    setPlatformId(next);
    if (next !== platformId) setAccountId("");
  };

  const save = async () => {
    setSaving(true);
    setError(null);

    const body = {
      method,
      platformId: numberOrNull(platformId),
      platformAccountId: numberOrNull(accountId),
      subscriptionId: numberOrNull(subscriptionId),
      /*
       * 가격을 비워도 **0으로 보낸다** (v1.2). 통화도 함께 — 예전엔 둘 다 null이라
       * "0원에 얻었다"와 "얼마인지 안 적었다"가 구별이 안 됐고 범위 필터에서 사라졌다
       */
      price: paid
        ? { amount: amount === "" ? 0 : Number(amount), currency }
        : { amount: 0, currency },
      acquiredOn: acquiredOn || null,
      label: label.trim() || null,
    };

    try {
      if (acquisition) await api.put(`/api/acquisitions/${acquisition.acquisitionId}`, body);
      else await api.post(`/api/backlog/${entryId}/acquisitions`, body);
      onSaved();
      onClose();
    } catch (caught) {
      setError(errorMessage(caught, "저장하지 못했습니다. 잠시 후 다시 시도해 주세요."));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={acquisition ? "취득 기록 수정" : "취득 기록 추가"}
      onClose={onClose}
      footer={
        <>
          {/* 회차와 같은 이유로 수정할 때만 뜬다 — 지울 방법이 여기밖에 없다 (FR-ACQ-07) */}
          {acquisition && (
            <button
              onClick={() => setRemoving(true)}
              className="text-xs text-white/30 transition-colors hover:text-red-400"
            >
              삭제
            </button>
          )}
          {error && <span className="mr-auto text-xs text-red-400">{error}</span>}
          {!error && acquisition && <span className="mr-auto" />}
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving ? "저장 중" : "저장"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {removing && (
          <ConfirmDialog
            title="취득 기록 삭제"
            message={
              <>
                이 취득 기록을 삭제합니다. 되돌릴 수 없으며,{" "}
                <b className="text-white">지출 통계에서도 빠집니다.</b>
              </>
            }
            onConfirm={async () => {
              await api.del(`/api/acquisitions/${acquisition!.acquisitionId}`);
              onSaved();
              onClose();
            }}
            onClose={() => setRemoving(false)}
          />
        )}

        <Field label="Method">
          <select
            value={method}
            onChange={(event) => setMethod(event.target.value as AcquisitionMethod)}
            className={FIELD_SELECT}
          >
            {METHODS.map((item) => (
              <option key={item} value={item}>
                {ACQUISITION_METHOD_LABEL[item]}
              </option>
            ))}
          </select>
        </Field>

        {/*
          ⚠️ **구매가 아니면 가격을 못 넣는다** (v1.2, 사용자 결정).
          안 가진 게임(NOT_OWNED)이나 무료(FREE)에 금액이 붙으면 뜻이 없다 —
          저장은 어차피 KRW 0으로 나가고, 서버도 같은 규칙으로 한 번 더 막는다
        */}
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field
            label="Price"
            hint={
              paid
                ? "실제 결제하신 금액. 비워 두시면 0원으로 저장됩니다"
                : "구매일 때만 입력하실 수 있습니다"
            }
          >
            <input
              type="text"
              inputMode="decimal"
              disabled={!paid}
              value={paid ? amount : ""}
              onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))}
              placeholder="15000"
              className={`${FIELD_INPUT} num disabled:cursor-not-allowed disabled:opacity-40`}
            />
          </Field>
          <Field label="Currency">
            <select
              value={currency}
              disabled={!paid}
              onChange={(event) => setCurrency(event.target.value as Currency)}
              className={`${FIELD_SELECT} disabled:cursor-not-allowed disabled:opacity-40`}
            >
              {CURRENCIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Acquired On" hint="지출 통계가 이 날짜를 기준으로 집계됩니다" composite>
          <DateField value={acquiredOn} onChange={setAcquiredOn} />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Platform">
            <select value={platformId} onChange={(e) => changePlatform(e.target.value)} className={FIELD_SELECT}>
              <option value="">선택 안 함</option>
              {withCurrent(options?.platforms ?? [], acquisition?.platform && { id: acquisition.platform.platformId, name: acquisition.platform.name }).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Account">
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className={FIELD_SELECT}
              disabled={!platformId}
            >
              <option value="">{platformId ? "선택 안 함" : "플랫폼을 먼저 고르세요"}</option>
              {accountChoices.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {method === "SUBSCRIPTION" && (
          <Field label="Subscription">
            <select
              value={subscriptionId}
              onChange={(e) => setSubscriptionId(e.target.value)}
              className={FIELD_SELECT}
            >
              <option value="">선택 안 함</option>
              {withCurrent(options?.subscriptions ?? [], acquisition?.subscription && { id: acquisition.subscription.subscriptionId, name: acquisition.subscription.serviceName }).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Label" hint="예) 스팀 여름 세일">
          <input
            type="text"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={100}
            className={FIELD_INPUT}
          />
        </Field>
      </div>
    </Modal>
  );
}

function numberOrNull(value: string): number | null {
  return value === "" ? null : Number(value);
}

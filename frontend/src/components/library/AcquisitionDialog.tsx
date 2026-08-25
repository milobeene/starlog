"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { Button, Field, FIELD_DATE, FIELD_INPUT, FIELD_SELECT } from "@/components/ui/Field";
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
  const [acquiredOn, setAcquiredOn] = useState(acquisition?.acquiredOn ?? "");
  const [label, setLabel] = useState(acquisition?.label ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError(null);

    const body = {
      method,
      platformId: numberOrNull(platformId),
      platformAccountId: numberOrNull(accountId),
      subscriptionId: numberOrNull(subscriptionId),
      price: amount === "" ? null : { amount: Number(amount), currency },
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

        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Price" hint="실제 결제하신 금액. 비워 두시면 금액 없음으로 처리됩니다">
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))}
              placeholder="15000"
              className={`${FIELD_INPUT} num`}
            />
          </Field>
          <Field label="Currency">
            <select
              value={currency}
              onChange={(event) => setCurrency(event.target.value as Currency)}
              className={FIELD_SELECT}
            >
              {CURRENCIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Acquired On" hint="지출 통계가 이 날짜를 기준으로 집계됩니다">
          <input
            type="date"
            value={acquiredOn}
            onChange={(event) => setAcquiredOn(event.target.value)}
            className={FIELD_DATE}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Platform">
            <select value={platformId} onChange={(e) => setPlatformId(e.target.value)} className={FIELD_SELECT}>
              <option value="">선택 안 함</option>
              {withCurrent(options?.platforms ?? [], acquisition?.platform && { id: acquisition.platform.platformId, name: acquisition.platform.name }).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Account">
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={FIELD_SELECT}>
              <option value="">선택 안 함</option>
              {withCurrent(options?.platformAccounts ?? [], acquisition?.platformAccount && { id: acquisition.platformAccount.accountId, name: acquisition.platformAccount.label }).map((item) => (
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

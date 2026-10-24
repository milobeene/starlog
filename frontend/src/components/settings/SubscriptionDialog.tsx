"use client";

import { useState } from "react";
import DateField from "@/components/ui/DateField";
import { Field, FIELD_INPUT, FIELD_SELECT } from "@/components/ui/Field";
import FormDialog from "@/components/settings/FormDialog";
import { api } from "@/lib/api";
import type { Subscription } from "@/lib/types";

/**
 * 구독 추가·수정.
 *
 * 예전엔 추가와 삭제만 있어서 **요금이 바뀌면 지우고 다시 만들어야 했다** —
 * 그러면 그 구독에 걸린 취득 기록의 연결이 끊긴다. 백엔드 PUT은 진작 있었다
 */
export default function SubscriptionDialog({
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

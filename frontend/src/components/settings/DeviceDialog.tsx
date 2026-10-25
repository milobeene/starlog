"use client";

import { useState } from "react";
import { Field, FIELD_INPUT } from "@/components/ui/Field";
import MarkdownTextarea from "@/components/ui/MarkdownTextarea";
import FormDialog, { BulkChangeNotice } from "@/components/settings/FormDialog";
import { api } from "@/lib/api";
import type { MemberDevice } from "@/lib/types";

/** 기기는 마스터에서 고르는 게 아니라 유형·라벨을 직접 적는다 */
export default function DeviceDialog({
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
      tall
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
      <Field label="Memo" hint="스펙·주의점 · 마크다운 · Enter로 목록 이어쓰기, Tab으로 들여쓰기" className="flex-1">
        <MarkdownTextarea fill value={memo} onChange={setMemo} maxLength={2000} />
      </Field>
    </FormDialog>
  );
}

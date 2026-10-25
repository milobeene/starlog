"use client";

import { useState } from "react";
import { Field, FIELD_INPUT } from "@/components/ui/Field";
import MarkdownTextarea from "@/components/ui/MarkdownTextarea";
import FormDialog, { BulkChangeNotice } from "@/components/settings/FormDialog";
import { api } from "@/lib/api";
import type { MemberEmulator } from "@/lib/types";

export default function EmulatorDialog({
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
      tall
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
      <Field label="Memo" hint="설정값·주의점 · 마크다운" className="flex-1">
        <MarkdownTextarea fill value={memo} onChange={setMemo} maxLength={2000} />
      </Field>
    </FormDialog>
  );
}

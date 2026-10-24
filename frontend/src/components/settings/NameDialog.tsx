"use client";

import { useState } from "react";
import { Field, FIELD_INPUT } from "@/components/ui/Field";
import FormDialog, { BulkChangeNotice } from "@/components/settings/FormDialog";
import { api } from "@/lib/api";

/** 이름 하나뿐인 선택지(플랫폼·입력 방식)의 추가·수정 */
export default function NameDialog({
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

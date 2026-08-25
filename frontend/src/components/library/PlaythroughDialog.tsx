"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import { Button, Field, FIELD_DATE, FIELD_INPUT, FIELD_SELECT } from "@/components/ui/Field";
import { api, errorMessage } from "@/lib/api";
import { INPUT_METHOD_LABEL, PLAYTHROUGH_STATUS_LABEL } from "@/lib/labels";
import { withCurrent } from "@/lib/options";
import type { InputMethod, OptionsResponse, Playthrough, PlaythroughStatus } from "@/lib/types";

const STATUSES: PlaythroughStatus[] = ["PLAYING", "PAUSED", "DROPPED", "COMPLETED"];
const INPUTS: InputMethod[] = ["XINPUT", "NINTENDO", "PLAYSTATION", "KEYBOARD_MOUSE"];

/**
 * 회차 추가·수정.
 *
 * **여기서 항목 상태가 결정된다** — 상세 화면에 상태 드롭다운이 없는 이유가 이것이다.
 * 회차를 저장하면 서버가 항목 상태와 lastPlaythrough를 다시 계산한다 (§7.2)
 */
export default function PlaythroughDialog({
  entryId,
  run,
  options,
  onClose,
  onSaved,
}: {
  entryId: number;
  run: Playthrough | null;
  options: OptionsResponse | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [startedOn, setStartedOn] = useState(run?.startedOn ?? "");
  const [finishedOn, setFinishedOn] = useState(run?.finishedOn ?? "");
  const [status, setStatus] = useState<PlaythroughStatus>(run?.status ?? "PLAYING");
  const [deviceId, setDeviceId] = useState(run?.device ? String(run.device.deviceId) : "");
  const [emulatorId, setEmulatorId] = useState(run?.emulator ? String(run.emulator.emulatorId) : "");
  const [accountId, setAccountId] = useState(
    run?.platformAccount ? String(run.platformAccount.accountId) : "",
  );
  const [inputMethod, setInputMethod] = useState<string>(run?.inputMethod ?? "");
  const [label, setLabel] = useState(run?.label ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!startedOn) {
      setError("시작일을 입력해 주세요.");
      return;
    }
    setSaving(true);
    setError(null);

    const body = {
      startedOn,
      finishedOn: finishedOn || null,
      status,
      deviceId: numberOrNull(deviceId),
      platformAccountId: numberOrNull(accountId),
      emulatorId: numberOrNull(emulatorId),
      inputMethod: inputMethod || null,
      label: label.trim() || null,
    };

    try {
      if (run) await api.put(`/api/playthroughs/${run.playthroughId}`, body);
      else await api.post(`/api/backlog/${entryId}/playthroughs`, body);
      onSaved();
      onClose();
    } catch (caught) {
      setError(errorMessage(caught, "저장하지 못했습니다. 잠시 후 다시 시도해 주세요."));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={run ? `${run.sequenceNo}회차 수정` : "회차 추가"}
      onClose={onClose}
      footer={
        <>
          {error && <span className="mr-auto text-xs text-red-400">{error}</span>}
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving ? "저장 중" : "저장"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Started">
            <input
              type="date"
              value={startedOn}
              onChange={(event) => setStartedOn(event.target.value)}
              className={FIELD_DATE}
            />
          </Field>
          <Field label="Finished" hint="비워 두시면 진행 중으로 표시됩니다">
            <input
              type="date"
              value={finishedOn}
              onChange={(event) => setFinishedOn(event.target.value)}
              className={FIELD_DATE}
            />
          </Field>
        </div>

        <Field label="Status" hint="이 값에 따라 게임 상태가 결정됩니다">
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as PlaythroughStatus)}
            className={FIELD_SELECT}
          >
            {STATUSES.map((item) => (
              <option key={item} value={item}>
                {PLAYTHROUGH_STATUS_LABEL[item]}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Device">
            <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} className={FIELD_SELECT}>
              <option value="">선택 안 함</option>
              {withCurrent(options?.devices ?? [], run?.device && { id: run.device.deviceId, name: run.device.name }).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Emulator">
            <select value={emulatorId} onChange={(e) => setEmulatorId(e.target.value)} className={FIELD_SELECT}>
              <option value="">선택 안 함</option>
              {withCurrent(options?.emulators ?? [], run?.emulator && { id: run.emulator.emulatorId, name: run.emulator.name }).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Account">
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={FIELD_SELECT}>
              <option value="">선택 안 함</option>
              {withCurrent(options?.platformAccounts ?? [], run?.platformAccount && { id: run.platformAccount.accountId, name: run.platformAccount.label }).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Input">
            <select value={inputMethod} onChange={(e) => setInputMethod(e.target.value)} className={FIELD_SELECT}>
              <option value="">선택 안 함</option>
              {INPUTS.map((item) => (
                <option key={item} value={item}>
                  {INPUT_METHOD_LABEL[item]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Label" hint="예) 하드 모드, 친구와 협동">
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

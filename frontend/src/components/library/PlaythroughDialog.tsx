"use client";

import { accountLabel } from "@/lib/labels";
import DateField from "@/components/ui/DateField";
import { useState } from "react";
import Modal from "@/components/ui/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { Button, Field, FIELD_INPUT, FIELD_SELECT } from "@/components/ui/Field";
import { api, errorMessage } from "@/lib/api";
import { PLAYTHROUGH_STATUS_LABEL } from "@/lib/labels";
import { withCurrent, withCurrentAmong } from "@/lib/options";
import type { OptionsResponse, Playthrough, PlaythroughStatus } from "@/lib/types";

const STATUSES: PlaythroughStatus[] = ["PLAYING", "PAUSED", "DROPPED", "COMPLETED"];

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
  const [platformId, setPlatformId] = useState(run?.platform ? String(run.platform.platformId) : "");
  /**
   * 플랫폼으로 했나, 에뮬레이터로 했나 (v1.1).
   *
   * **동시에 고를 일이 없다** — 스팀에서 하면서 동시에 에뮬을 쓰는 경우는 없다.
   * 기존 회차는 에뮬이 있으면 에뮬 쪽으로 연다
   */
  const [runsOn, setRunsOn] = useState<"platform" | "emulator">(
    run?.emulator ? "emulator" : "platform",
  );
  const [accountId, setAccountId] = useState(
    run?.platformAccount ? String(run.platformAccount.accountId) : "",
  );
  const [inputMethodId, setInputMethodId] = useState(
    run?.inputMethod ? String(run.inputMethod.inputMethodId) : "",
  );
  const [label, setLabel] = useState(run?.label ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  /*
   * 계정 이름에 소속 플랫폼을 붙인다 — "Beene (Steam)" 꼴.
   * 라벨은 회원이 정하는 자유 문자열이라 플랫폼마다 같은 이름이 흔하고,
   * 그대로 두면 선택지에 구별 불가능한 항목이 여러 개 뜬다
   */
  /*
   * ⚠️ **고른 소속의 계정만 보여준다** (v1.1). 스팀을 골랐는데 닌텐도 계정이 뜨면
   * "스팀 + 닌텐도 계정" 같은 모순이 저장된다 — 취득 다이얼로그와 같은 규칙이다
   */
  const owner = runsOn === "platform" ? numberOrNull(platformId) : numberOrNull(emulatorId);
  const allAccounts = (options?.platformAccounts ?? []).map((account) => ({
    id: account.id,
    name: accountLabel(account.platformName ?? account.emulatorName, account.name),
  }));
  const accountChoices = withCurrentAmong(
    (options?.platformAccounts ?? [])
      .filter((account) =>
        owner == null
          ? false
          : runsOn === "platform"
            ? account.platformId === owner
            : account.emulatorId === owner,
      )
      .map((account) => ({
        id: account.id,
        name: accountLabel(account.platformName ?? account.emulatorName, account.name),
      })),
    allAccounts,
    run?.platformAccount && {
      id: run.platformAccount.accountId,
      name: run.platformAccount.label,
    },
  );

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
      // 고르지 않은 쪽은 비워 보낸다 — 토글을 바꿨을 때 옛 값이 남으면 둘 다인 상태가 된다
      platformId: runsOn === "platform" ? numberOrNull(platformId) : null,
      emulatorId: runsOn === "emulator" ? numberOrNull(emulatorId) : null,
      platformAccountId: numberOrNull(accountId),
      inputMethodId: numberOrNull(inputMethodId),
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
          {/*
            삭제는 **수정할 때만** 뜬다. 잘못 추가한 회차를 지울 방법이 여기밖에 없다 —
            백엔드에는 진작 있었는데 화면이 없어 수정만 가능했다 (FR-PT-08)
          */}
          {run && (
            <button
              onClick={() => setRemoving(true)}
              className="text-xs text-white/30 transition-colors hover:text-red-400"
            >
              삭제
            </button>
          )}
          {error && <span className="mr-auto text-xs text-red-400">{error}</span>}
          {!error && run && <span className="mr-auto" />}
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving ? "저장 중" : "저장"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Started" composite>
            <DateField value={startedOn} onChange={setStartedOn} />
          </Field>
          <Field label="Finished" hint="비워 두시면 진행 중으로 표시됩니다" composite>
            <DateField value={finishedOn} onChange={setFinishedOn} />
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
          <Field label={runsOn === "platform" ? "Platform" : "Emulator"}>
            {/*
              토글 (v1.1). 플랫폼과 에뮬은 **동시에 고를 일이 없어서** 한 칸을 나눠 쓴다.
              바꾸면 아래 계정을 비운다 — 안 그러면 "스위치 + 스팀 계정"이 남는다
            */}
            {runsOn === "platform" ? (
              <select
                value={platformId}
                onChange={(e) => {
                  setPlatformId(e.target.value);
                  setAccountId("");
                }}
                className={FIELD_SELECT}
              >
                <option value="">선택 안 함</option>
                {withCurrent(
                  options?.platforms ?? [],
                  run?.platform && { id: run.platform.platformId, name: run.platform.name },
                ).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={emulatorId}
                onChange={(e) => {
                  setEmulatorId(e.target.value);
                  setAccountId("");
                }}
                className={FIELD_SELECT}
              >
                <option value="">선택 안 함</option>
                {withCurrent(options?.emulators ?? [], run?.emulator && { id: run.emulator.emulatorId, name: run.emulator.name }).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            )}
            <div className="mt-1.5 flex gap-1">
              {(["platform", "emulator"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setRunsOn(mode);
                    setAccountId("");
                  }}
                  className={`rounded px-2 py-0.5 text-[10px] tracking-widest uppercase transition-colors ${
                    runsOn === mode
                      ? "bg-white/15 text-white"
                      : "text-white/35 hover:bg-white/8 hover:text-white/70"
                  }`}
                >
                  {mode === "platform" ? "플랫폼" : "에뮬"}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Account">
            {/*
              **소속을 먼저 고르게 잠근다** (v1.2, 취득 다이얼로그와 같은 규칙).
              목록은 이미 고른 소속의 것만인데 잠그지 않으면, 소속이 비었을 때 선택지가
              통째로 빈 채로 열려서 "계정이 하나도 없다"로 보인다
            */}
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className={FIELD_SELECT}
              disabled={!owner}
            >
              <option value="">
                {owner
                  ? "선택 안 함"
                  : runsOn === "platform"
                    ? "플랫폼을 먼저 고르세요"
                    : "에뮬을 먼저 고르세요"}
              </option>
              {accountChoices.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Input">
            <select value={inputMethodId} onChange={(e) => setInputMethodId(e.target.value)} className={FIELD_SELECT}>
              <option value="">선택 안 함</option>
              {withCurrent(options?.inputMethods ?? [], run?.inputMethod && { id: run.inputMethod.inputMethodId, name: run.inputMethod.name }).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {removing && (
          <ConfirmDialog
            title={`${run?.sequenceNo}회차 삭제`}
            message={
              <>
                <b className="text-white">{run?.sequenceNo}회차</b> 기록을 삭제합니다. 되돌릴 수
                없으며, 남은 회차의 번호는 다시 매겨지지 않습니다.
              </>
            }
            onConfirm={async () => {
              await api.del(`/api/playthroughs/${run!.playthroughId}`);
              onSaved();
              onClose();
            }}
            onClose={() => setRemoving(false)}
          />
        )}

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

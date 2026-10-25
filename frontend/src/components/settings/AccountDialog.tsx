"use client";

import { useState } from "react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { Field, FIELD_INPUT, FIELD_SELECT } from "@/components/ui/Field";
import FormDialog, { BulkChangeNotice } from "@/components/settings/FormDialog";
import { api, ApiError, ERROR } from "@/lib/api";
import type { MemberEmulator, MemberPlatform, PlatformAccountRef } from "@/lib/types";

/**
 * 플랫폼 계정 추가·수정.
 *
 * 되살리기를 **되묻는 유일한 선택지다.** 나머지 넷은 같은 이름으로 다시 추가하면 조용히
 * 되살아나는데, 계정은 취득 기록(구매 이력)까지 물고 있어서 사용자가 알고 되살리는 편이 낫다 (§7.4).
 * 예전에는 안내만 하고 버튼이 없어 아무것도 할 수 없었다. 그 뒤에도 폼이 저장 성공으로 알고
 * 바로 닫혀서 확인창이 한 프레임도 못 떴다 — 그래서 `"keep-open"`으로 닫힘을 건너뛴다
 */
export default function AccountDialog({
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
        // 고르지 않으면 Number("")=0이 나간다 — 서버 오류 문구보다 먼저 여기서 막는다
        const ownerId = ownerKind === "platform" ? platformId : emulatorId;
        if (!ownerId) throw new Error(ownerKind === "platform" ? "플랫폼을 골라 주세요." : "에뮬레이터를 골라 주세요.");
        if (!label.trim()) throw new Error("라벨을 입력해 주세요.");
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
              return "keep-open";
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

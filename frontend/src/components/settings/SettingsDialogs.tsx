"use client";

import ProfileDialog from "@/components/settings/ProfileDialog";
import NameDialog from "@/components/settings/NameDialog";
import AccountDialog from "@/components/settings/AccountDialog";
import DeviceDialog from "@/components/settings/DeviceDialog";
import EmulatorDialog from "@/components/settings/EmulatorDialog";
import SubscriptionDialog from "@/components/settings/SubscriptionDialog";
import type { SettingsDialog } from "@/components/settings/settingsDialog";
import type { MeResponse } from "@/lib/types";

/** 설정 화면이 여는 다이얼로그 전부 — 어느 것을 열지는 `dialog.kind`가 정한다 */
export default function SettingsDialogs({
  dialog,
  data,
  onClose,
  onSaved,
}: {
  dialog: SettingsDialog;
  data: MeResponse | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <>
    {(dialog?.kind === "profile" || dialog?.kind === "memo") && data && (
      <ProfileDialog
        profile={data.profile}
        field={dialog.kind === "memo" ? "memo" : "nickname"}
        onClose={() => onClose()}
        onSaved={onSaved}
      />
    )}
    {dialog?.kind === "platform" && (
      <NameDialog
        title="플랫폼"
        hint="예) Steam, PlayStation"
        basePath="/api/me/platforms"
        edit={dialog.edit && { id: dialog.edit.platformId, name: dialog.edit.name }}
        onClose={() => onClose()}
        onSaved={onSaved}
      />
    )}
    {dialog?.kind === "inputMethod" && (
      <NameDialog
        title="입력 방식"
        hint="예) 듀얼센스, 키보드 & 마우스"
        basePath="/api/me/input-methods"
        edit={dialog.edit && { id: dialog.edit.inputMethodId, name: dialog.edit.name }}
        onClose={() => onClose()}
        onSaved={onSaved}
      />
    )}
    {dialog?.kind === "account" && (
      <AccountDialog
        emulators={data?.emulators ?? []}
        platforms={data?.platforms ?? []}
        edit={dialog.edit}
        onClose={() => onClose()}
        onSaved={onSaved}
      />
    )}
    {dialog?.kind === "device" && (
      <DeviceDialog edit={dialog.edit} onClose={() => onClose()} onSaved={onSaved} />
    )}
    {dialog?.kind === "emulator" && (
      <EmulatorDialog edit={dialog.edit} onClose={() => onClose()} onSaved={onSaved} />
    )}
    {dialog?.kind === "subscription" && (
      <SubscriptionDialog edit={dialog.edit} onClose={() => onClose()} onSaved={onSaved} />
    )}
    </>
  );
}

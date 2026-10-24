"use client";

import { useState } from "react";
import { Field, FIELD_INPUT } from "@/components/ui/Field";
import MarkdownTextarea from "@/components/ui/MarkdownTextarea";
import PaletteEditor from "@/components/settings/PaletteEditor";
import FormDialog from "@/components/settings/FormDialog";
import { api } from "@/lib/api";
import { refreshSession } from "@/lib/session";
import { paletteOf, toPayload } from "@/lib/palette";
import type { MeResponse } from "@/lib/types";

export default function ProfileDialog({
  profile,
  field,
  onClose,
  onSaved,
}: {
  profile: MeResponse["profile"];
  field: "nickname" | "memo";
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nickname, setNickname] = useState(profile.nickname);
  const [memo, setMemo] = useState(profile.memo ?? "");
  // 아직 저장 안 한 값이다. 취소하면 그냥 버려진다 — 그래서 상태의 주인이 여기 하나여야 한다
  const [colors, setColors] = useState(() => [...paletteOf(profile.backgroundColors)]);

  return (
    <FormDialog
      title={field === "nickname" ? "프로필" : "메모"}
      onClose={onClose}
      onSubmit={async () => {
        await api.put("/api/me/profile", {
          nickname,
          memo: memo.trim() || null,
          // 기본값과 같으면 빈 문자열 → 서버가 null로 되돌린다 ("안 고름")
          backgroundColors: toPayload(colors),
        });
        /*
         * 세션까지 다시 받는다. onSaved()는 이 화면의 useApi만 새로 고치는데,
         * **배경은 세션 스토어를 본다** — 이게 없으면 새로고침 전까지 옛 색으로 남는다
         */
        await refreshSession();
        onSaved();
      }}
    >
      {field === "nickname" ? (
        <>
          <Field label="Nickname">
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              maxLength={30}
              className={FIELD_INPUT}
            />
          </Field>

          <Field
            label="Background"
            hint="고르는 즉시 위 창에 반영됩니다 · 저장을 눌러야 실제로 바뀝니다"
            // 색 선택기가 다섯이라 label로 감싸면 빈 곳 클릭이 첫 칸(기조)을 연다
            composite
          >
            <PaletteEditor colors={colors} onChange={setColors} />
          </Field>
        </>
      ) : (
        <Field label="Memo" hint="마크다운을 지원합니다 · Enter로 목록 이어쓰기, Tab으로 들여쓰기 · 2,000자 이내">
          <MarkdownTextarea value={memo} onChange={setMemo} rows={12} maxLength={2000} />
        </Field>
      )}
    </FormDialog>
  );
}

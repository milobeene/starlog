"use client";

import { useState } from "react";
import type { Profile } from "@/lib/types";
import Button from "@/components/common/Button";
import InfoRow from "@/components/common/InfoRow";
import SettingsSection from "./SettingsSection";
import form from "@/components/common/form.module.css";

type Props = {
  profile: Profile;
};

/** PUT /api/me/profile — 이메일은 수정 불가 */
export default function ProfileSection({ profile }: Props) {
  const [editing, setEditing] = useState(false);

  return (
    <SettingsSection
      title="프로필"
      action={
        !editing && (
          <Button size="sm" onClick={() => setEditing(true)}>
            편집
          </Button>
        )
      }
    >
      {editing ? (
        <div className={form.stack}>
          <label className={form.field}>
            <span className={form.label}>이메일</span>
            <input className={form.input} defaultValue={profile.email} disabled />
            <span className={form.hint}>이메일은 로그인 수단이라 바꿀 수 없습니다</span>
          </label>

          <label className={form.field}>
            <span className={form.label}>닉네임 *</span>
            <input className={form.input} defaultValue={profile.nickname} required />
          </label>

          <label className={form.field}>
            <span className={form.label}>메모</span>
            <textarea
              className={form.textarea}
              maxLength={2000}
              defaultValue={profile.memo ?? ""}
            />
            <span className={form.hint}>최대 2000자</span>
          </label>

          <div className={form.actions}>
            <Button size="sm" onClick={() => setEditing(false)}>
              취소
            </Button>
            <Button size="sm" variant="primary" onClick={() => setEditing(false)}>
              저장
            </Button>
          </div>
        </div>
      ) : (
        <dl>
          <InfoRow label="이메일">{profile.email}</InfoRow>
          <InfoRow label="닉네임">{profile.nickname}</InfoRow>
          <InfoRow label="메모">{profile.memo ?? "—"}</InfoRow>
        </dl>
      )}
    </SettingsSection>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AuthCard from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/Field";
import { api, errorMessage } from "@/lib/api";
import { logout, refreshSession } from "@/lib/session";

/**
 * 탈퇴 유예(30일) 중 로그인하면 도착한다.
 *
 * 이 계정은 `ROLE_PENDING_DELETION`이라 **`/api/me/restore` 말고는 전부 403**이다 —
 * 그래서 여기서 남은 일수 같은 걸 조회할 수 없다 (서버가 안 주기도 한다)
 */
export default function RestorePage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <AuthCard title="계정을 복구하시겠습니까?" subtitle="탈퇴를 요청하신 계정입니다.">
      <p className="mb-6 text-sm leading-relaxed text-white/60">
        유예 기간 중이라 기록이 그대로 남아 있습니다. 복구하시면 즉시 다시 이용하실 수 있으며,
        그대로 두시면 <b className="text-white/80">30일 후 완전히 삭제됩니다.</b>
      </p>

      {error && (
        <div className="mb-4 rounded-md border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Button
          variant="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await api.post("/api/me/restore");
              // 복구되면 권한이 바뀐다(PENDING_DELETION → USER). 세션을 다시 받아야 반영된다
              await refreshSession();
              router.push("/dashboard");
            } catch (caught) {
              setError(errorMessage(caught, "계정을 복구하지 못했습니다. 잠시 후 다시 시도해 주세요."));
              setBusy(false);
            }
          }}
        >
          {busy ? "복구 중" : "계정 복구"}
        </Button>
        <Button onClick={() => void logout()}>로그아웃</Button>
      </div>
    </AuthCard>
  );
}

"use client";

import { useState } from "react";
import PageHeading from "@/components/ui/PageHeading";
import ErrorNotice from "@/components/ui/ErrorNotice";
import Pagination from "@/components/ui/Pagination";
import DataTable from "@/components/library/DataTable";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApi } from "@/lib/useApi";
import type { AdminMember, AuditLog, PageResponse } from "@/lib/types";

const TABS = [
  { key: "members", label: "회원" },
  { key: "logs", label: "감사 로그" },
] as const;

/**
 * 관리자 화면. 조회만 한다 — 회원 정지·강제 탈퇴는 스펙 범위 밖이다 (§6.12).
 *
 * **화면을 숨기는 건 보안이 아니다.** 실제 방어선은 서버의 403이라
 * 여기서 role을 보고 가리지 않고, 권한이 없으면 ErrorNotice가 뜬다
 */
export default function AdminPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("members");
  const [page, setPage] = useState(0);

  const path =
    tab === "members"
      ? `/api/admin/members?page=${page}&size=20`
      : `/api/admin/audit-logs?page=${page}&size=20`;

  const data = useApi<PageResponse<AdminMember | AuditLog>>(path);

  return (
    <main className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-8 pt-24 pb-20">
        <PageHeading
          eyebrow="Admin"
          title="관리자"
          subtitle="조회와 마스터 정리용. 회원 제재 기능은 두지 않았어."
        />

        <div className="mt-8 mb-6 flex gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
          {TABS.map((item) => (
            <button
              key={item.key}
              onClick={() => {
                setTab(item.key);
                setPage(0);
              }}
              aria-pressed={tab === item.key}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === item.key ? "bg-white text-black" : "text-white/50 hover:text-white"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {data.error ? (
          <ErrorNotice error={data.error} onRetry={data.reload} />
        ) : data.loading ? (
          <Skeleton className="h-64 w-full" />
        ) : tab === "members" ? (
          <DataTable headers={["ID", "이메일", "닉네임", "권한", "인증", "가입일", "상태"]}>
            {(data.data?.items as AdminMember[])?.map((member) => (
              <tr key={member.memberId} className="hover:bg-white/[0.03]">
                <td className="num px-4 py-3 text-white/50">{member.memberId}</td>
                <td className="px-4 py-3 text-white/90">{member.email}</td>
                <td className="px-4 py-3 text-white/70">{member.nickname}</td>
                <td className="px-4 py-3 text-white/50">{member.role}</td>
                <td className="px-4 py-3">
                  {member.emailVerified ? (
                    <span className="text-green-400">완료</span>
                  ) : (
                    <span className="text-yellow-400">미인증</span>
                  )}
                </td>
                <td className="num px-4 py-3 text-white/50">{member.createdAt.slice(0, 10)}</td>
                <td className="px-4 py-3">
                  {member.deletedAt ? (
                    <span className="text-red-400">탈퇴 유예</span>
                  ) : (
                    <span className="text-white/40">정상</span>
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <DataTable headers={["시각", "행위자", "행위", "대상", "IP"]}>
            {(data.data?.items as AuditLog[])?.map((log) => (
              <tr key={log.auditLogId} className="hover:bg-white/[0.03]">
                <td className="num px-4 py-3 text-white/50">
                  {log.occurredAt.slice(0, 19).replace("T", " ")}
                </td>
                <td className="px-4 py-3 text-white/70">{log.actorEmail}</td>
                <td className="px-4 py-3 text-white/90">{log.action}</td>
                <td className="px-4 py-3 text-white/50">
                  {log.targetType ? `${log.targetType} #${log.targetId ?? "—"}` : "—"}
                </td>
                <td className="num px-4 py-3 text-white/40">{log.requestIp ?? "—"}</td>
              </tr>
            ))}
          </DataTable>
        )}

        {data.data && (
          <Pagination page={page} totalPages={data.data.totalPages} onChange={setPage} />
        )}
      </div>
    </main>
  );
}

package com.milobeene.gamebacklog.admin.service;

import com.milobeene.gamebacklog.admin.dto.AdminMemberResponse;
import com.milobeene.gamebacklog.admin.dto.AuditLogResponse;
import com.milobeene.gamebacklog.admin.repository.AuditLogRepository;
import com.milobeene.gamebacklog.common.dto.PageResponse;
import com.milobeene.gamebacklog.member.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 관리자 조회 (FR-ADM-03) */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AdminQueryService {

    private static final int MAX_SIZE = 100;

    private final MemberRepository memberRepository;
    private final AuditLogRepository auditLogRepository;

    public PageResponse<AdminMemberResponse> findMembers(int page, int size) {
        // 상한은 서버가 정한다. 클라이언트가 "전부 주세요"를 할 수 없어야 한다
        int limited = Math.min(Math.max(size, 1), MAX_SIZE);

        return PageResponse.from(
                memberRepository.findAllBy(PageRequest.of(page, limited))
                        .map(AdminMemberResponse::from));
    }

    /**
     * 감사 로그 조회 (FR-ADM-05).
     * 이 조회 자체도 감사 로그에 남는다 — 관리자 경로 전체가 기록 대상이다 (AUTH-P1)
     */
    public PageResponse<AuditLogResponse> findAuditLogs(int page, int size) {
        int limited = Math.min(Math.max(size, 1), MAX_SIZE);

        return PageResponse.from(
                auditLogRepository.findPageWithActor(PageRequest.of(page, limited))
                        .map(AuditLogResponse::from));
    }
}

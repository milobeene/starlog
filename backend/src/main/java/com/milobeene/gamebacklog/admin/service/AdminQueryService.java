package com.milobeene.gamebacklog.admin.service;

import com.milobeene.gamebacklog.admin.dto.AdminGameResponse;
import com.milobeene.gamebacklog.admin.dto.AdminMemberResponse;
import com.milobeene.gamebacklog.admin.dto.AuditLogResponse;
import com.milobeene.gamebacklog.admin.repository.AuditLogRepository;
import com.milobeene.gamebacklog.common.dto.PageResponse;
import com.milobeene.gamebacklog.common.util.TextValues;
import com.milobeene.gamebacklog.game.repository.GameRepository;
import com.milobeene.gamebacklog.member.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** 관리자 조회 (FR-ADM-01, 03, 05) */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AdminQueryService {

    private static final int MAX_SIZE = 100;

    private final MemberRepository memberRepository;
    private final AuditLogRepository auditLogRepository;
    private final GameRepository gameRepository;

    /**
     * 회원 검색 (FR-ADM-03). 이메일 부분 일치 + 가입일 범위. 빈 값은 조건에서 빠진다.
     *
     * `joinedTo`는 **그날 하루를 포함해야 한다.** 사용자가 "8월 25일까지"라고 넣으면
     * 8월 25일에 가입한 사람을 기대하는데, 날짜를 그대로 상한으로 쓰면 그날 00:00 이후가 전부 빠진다.
     * 그래서 다음 날 00:00 미만으로 바꾼다 (쿼리 조건도 `<`)
     */
    public PageResponse<AdminMemberResponse> findMembers(
            String email, LocalDate joinedFrom, LocalDate joinedTo, int page, int size) {

        LocalDateTime from = (joinedFrom == null) ? null : joinedFrom.atStartOfDay();
        LocalDateTime to = (joinedTo == null) ? null : joinedTo.plusDays(1).atStartOfDay();

        return PageResponse.from(
                memberRepository.search(TextValues.normalize(email), from, to, pageRequest(page, size))
                        .map(AdminMemberResponse::from));
    }

    /** 마스터 게임 목록 (FR-ADM-01). 검색어가 없으면 전체를 이름순으로 준다 */
    public PageResponse<AdminGameResponse> findGames(String keyword, int page, int size) {
        return PageResponse.from(
                gameRepository.searchPage(TextValues.normalize(keyword), pageRequest(page, size))
                        .map(AdminGameResponse::from));
    }

    /**
     * 감사 로그 조회 (FR-ADM-05).
     * 이 조회 자체도 감사 로그에 남는다 — 관리자 경로 전체가 기록 대상이다 (AUTH-P1)
     */
    public PageResponse<AuditLogResponse> findAuditLogs(int page, int size) {
        return PageResponse.from(
                auditLogRepository.findPageWithActor(pageRequest(page, size))
                        .map(AuditLogResponse::from));
    }

    /** 상한은 서버가 정한다. 클라이언트가 "전부 주세요"를 할 수 없어야 한다 */
    private PageRequest pageRequest(int page, int size) {
        return PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), MAX_SIZE));
    }
}

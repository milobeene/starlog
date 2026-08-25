package com.milobeene.starlog.admin.dto;

import com.milobeene.starlog.member.domain.Member;

import java.time.LocalDateTime;

/** 회원 목록 (FR-ADM-03). **비밀번호 해시는 내보내지 않는다** — 관리자에게도 */
public record AdminMemberResponse(
        Long memberId,
        String email,
        String nickname,
        String role,
        boolean emailVerified,
        /** null이면 승인 대기 (FR-ADM-06) */
        LocalDateTime approvedAt,
        LocalDateTime deletedAt,
        LocalDateTime createdAt) {

    public static AdminMemberResponse from(Member member) {
        return new AdminMemberResponse(
                member.getId(), member.getEmail(), member.getNickname(),
                member.getRole().name(), member.isEmailVerified(),
                member.getApprovedAt(), member.getDeletedAt(), member.getCreatedAt());
    }
}

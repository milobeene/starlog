package com.milobeene.starlog.member.controller;

import com.milobeene.starlog.common.web.LoginMember;
import com.milobeene.starlog.member.dto.MeResponse;
import com.milobeene.starlog.member.dto.OptionsResponse;
import com.milobeene.starlog.member.dto.PasswordChangeRequest;
import com.milobeene.starlog.member.dto.ProfileUpdateRequest;
import com.milobeene.starlog.member.service.MeQueryService;
import com.milobeene.starlog.auth.service.GoogleAccountService;
import com.milobeene.starlog.member.service.MemberService;
import com.milobeene.starlog.member.service.WithdrawalService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/me")
@RequiredArgsConstructor
public class MeController {

    private final MeQueryService meQueryService;
    private final MemberService memberService;
    private final WithdrawalService withdrawalService;
    private final GoogleAccountService googleAccountService;

    /** 프로필 / 설정 (화면 4) */
    @GetMapping
    public MeResponse me(@LoginMember Long memberId) {
        return meQueryService.findMe(memberId);
    }

    /** 편집 폼 선택지 (화면 2·4 공용) */
    @GetMapping("/options")
    public OptionsResponse options(@LoginMember Long memberId) {
        return meQueryService.findOptions(memberId);
    }

    @PutMapping("/profile")
    public void updateProfile(@LoginMember Long memberId,
                              @Valid @RequestBody ProfileUpdateRequest request) {
        memberService.updateProfile(memberId, request.nickname(), request.memo());
    }

    /**
     * 구글 연결 해제 (FR-AUTH-08).
     * 비밀번호가 없으면 거부된다 — 로그인 수단이 하나도 안 남는다 (BR-AUTH-01)
     */
    /** 비밀번호 변경·설정 (BR-AUTH-01). 구글 전용 계정이 비밀번호를 만드는 경로이기도 하다 */
    @PutMapping("/password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void changePassword(@LoginMember Long memberId,
                               @Valid @RequestBody PasswordChangeRequest request) {
        memberService.changePassword(memberId, request.currentPassword(), request.newPassword());
    }

    @DeleteMapping("/google")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void unlinkGoogle(@LoginMember Long memberId) {
        googleAccountService.unlink(memberId);
    }

    /**
     * 탈퇴 요청 (FR-AUTH-09). 30일 유예 후 배치가 물리 삭제한다.
     * 요청 즉시 세션이 끊긴다 — 다시 로그인하면 복구 화면으로 유도된다
     */
    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void withdraw(@LoginMember Long memberId) {
        withdrawalService.withdraw(memberId);
    }

    /** 유예 중 복구 (FR-AUTH-10). 이 경로만 ROLE_PENDING_DELETION으로 열려 있다 */
    @PostMapping("/restore")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void restore(@LoginMember Long memberId) {
        withdrawalService.restore(memberId);
    }
}

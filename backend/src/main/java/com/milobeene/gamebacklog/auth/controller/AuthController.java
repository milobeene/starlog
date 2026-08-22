package com.milobeene.gamebacklog.auth.controller;

import com.milobeene.gamebacklog.auth.dto.EmailVerificationRequest;
import com.milobeene.gamebacklog.auth.dto.PasswordResetConfirmRequest;
import com.milobeene.gamebacklog.auth.dto.PasswordResetRequest;
import com.milobeene.gamebacklog.auth.dto.ResendRequest;
import com.milobeene.gamebacklog.auth.dto.SignUpRequest;
import com.milobeene.gamebacklog.auth.service.AuthService;
import com.milobeene.gamebacklog.auth.service.EmailVerificationService;
import com.milobeene.gamebacklog.auth.service.PasswordResetService;
import com.milobeene.gamebacklog.common.dto.IdResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;

/**
 * 인증 관련 엔드포인트. 로그인·로그아웃은 I-3에서 **시큐리티 필터가 처리**하므로
 * 여기에 메서드로 생기지 않는다 — 컨트롤러에 안 보이는 게 정상이다.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final EmailVerificationService emailVerificationService;
    private final PasswordResetService passwordResetService;

    /** 가입하면 인증 메일이 나간다. 인증 전에는 로그인해도 403이다 (FR-AUTH-02) */
    @PostMapping("/signup")
    public ResponseEntity<IdResponse> signUp(@RequestBody @Valid SignUpRequest request) {
        Long memberId = authService.signUp(request.email(), request.password(), request.nickname());
        return ResponseEntity.created(URI.create("/api/me")).body(IdResponse.of(memberId));
    }

    /** 메일 링크의 토큰을 프론트가 읽어 여기로 보낸다 */
    @PostMapping("/email-verification")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void verifyEmail(@RequestBody @Valid EmailVerificationRequest request) {
        emailVerificationService.verify(request.token());
    }

    /**
     * 재발송. 가입 여부·인증 여부·스로틀 여부와 무관하게 **항상 202**다 (NFR-S3).
     * 응답이 달라지면 가입자 이메일 목록을 열거할 수 있다.
     */
    @PostMapping("/email-verification/resend")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void resendVerification(@RequestBody @Valid ResendRequest request) {
        emailVerificationService.resend(request.email());
    }

    /** 재설정 요청. 가입 여부와 무관하게 **항상 202** (NFR-S3) */
    @PostMapping("/password-reset/request")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void requestPasswordReset(@RequestBody @Valid PasswordResetRequest request) {
        passwordResetService.request(request.email());
    }

    /** 재설정 확정. 성공하면 그 회원의 **기존 세션이 전부 끊긴다** (FR-AUTH-05) */
    @PostMapping("/password-reset")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void resetPassword(@RequestBody @Valid PasswordResetConfirmRequest request) {
        passwordResetService.reset(request.token(), request.newPassword());
    }
}

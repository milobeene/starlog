package com.milobeene.starlog.member.controller;

import com.milobeene.starlog.common.quota.QuotaGuard;
import com.milobeene.starlog.common.web.LoginMember;
import com.milobeene.starlog.member.dto.MeResponse;
import com.milobeene.starlog.member.dto.OptionsResponse;
import com.milobeene.starlog.member.dto.PasswordChangeRequest;
import com.milobeene.starlog.member.dto.ProfileUpdateRequest;
import com.milobeene.starlog.common.util.AppClock;
import com.milobeene.starlog.member.dto.MemberExport;
import com.milobeene.starlog.member.service.MeQueryService;
import com.milobeene.starlog.member.service.MemberExportService;
import com.milobeene.starlog.member.service.MemberImportService;
import com.milobeene.starlog.auth.service.GoogleAccountService;
import com.milobeene.starlog.member.service.MemberService;
import com.milobeene.starlog.member.service.WithdrawalService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.format.DateTimeFormatter;
import java.util.List;

@RestController
@RequestMapping("/api/me")
@RequiredArgsConstructor
public class MeController {

    private final MeQueryService meQueryService;
    private final MemberService memberService;
    private final WithdrawalService withdrawalService;
    private final GoogleAccountService googleAccountService;
    /* WEB-ONLY: 일일 쿼터 (docs/web-only-inventory.md) */
    private final QuotaGuard quotaGuard;
    private final MemberExportService memberExportService;
    private final MemberImportService memberImportService;

    /** 프로필 / 설정 (화면 4) */
    @GetMapping
    public MeResponse me(@LoginMember Long memberId) {
        return meQueryService.findMe(memberId);
    }

    /**
     * WEB-ONLY: 오늘 남은 쿼터 (docs/capacity-planning.md §2-B).
     *
     * **"모르고 막히는 것"보다 "하루에 몇 건까지인지 보이는 것"이 낫다**는 방침의 화면 쪽 절반이다.
     *
     * 쿼터가 없는 빌드에서는 `NoOpQuotaGuard`가 빈 목록을 준다 — 404가 아니라 빈 배열인 이유는
     * 프론트가 `length === 0`으로 섹션을 통째로 안 그리면 되기 때문이다. 에러 처리가 안 늘어난다
     */
    @GetMapping("/quota")
    public List<QuotaGuard.QuotaStatus> quota(@LoginMember Long memberId) {
        return quotaGuard.statusOf(memberId);
    }

    /**
     * 데이터 내보내기 — 백업이자 이사 수단 (v1.0 작업순서 0번).
     *
     * 파일로 떨어지게 `Content-Disposition`을 붙인다. 브라우저에서 그냥 열리면
     * 몇 MB짜리 JSON이 화면을 채우고, 저장하려면 다시 우클릭해야 한다.
     *
     * 자격증명은 안 담긴다 — 이 파일은 동기화 폴더에 놓일 물건이다 (MemberExport 주석)
     */
    @GetMapping("/export")
    public ResponseEntity<MemberExport> export(@LoginMember Long memberId) {
        MemberExport data = memberExportService.export(memberId);

        String filename = "starlog-backup-%s.json"
                .formatted(AppClock.today().format(DateTimeFormatter.BASIC_ISO_DATE));

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .body(data);
    }

    /**
     * 데이터 가져오기. **빈 계정에만 들어간다** — 병합은 409로 거부한다.
     * 복원은 갈아끼우는 것이지 합치는 것이 아니다 (MemberImportService 주석)
     */
    @PostMapping("/import")
    public MemberImportService.Result importData(@LoginMember Long memberId,
                                                 @RequestBody MemberExport data) {
        return memberImportService.importInto(memberId, data);
    }

    /** 편집 폼 선택지 (화면 2·4 공용) */
    @GetMapping("/options")
    public OptionsResponse options(@LoginMember Long memberId) {
        return meQueryService.findOptions(memberId);
    }

    @PutMapping("/profile")
    public void updateProfile(@LoginMember Long memberId,
                              @Valid @RequestBody ProfileUpdateRequest request) {
        memberService.updateProfile(memberId, request.nickname(), request.memo(),
                request.backgroundColors());
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

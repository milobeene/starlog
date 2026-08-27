package com.milobeene.starlog.member.controller;

import com.milobeene.starlog.common.web.LoginMember;
import com.milobeene.starlog.member.dto.MeResponse;
import com.milobeene.starlog.member.dto.OptionsResponse;
import com.milobeene.starlog.member.dto.ProfileUpdateRequest;
import com.milobeene.starlog.common.util.AppClock;
import com.milobeene.starlog.member.dto.MemberExport;
import com.milobeene.starlog.member.service.MeQueryService;
import com.milobeene.starlog.member.service.MemberExportService;
import com.milobeene.starlog.member.service.MemberImportService;
import com.milobeene.starlog.member.service.MemberService;
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
    private final MemberExportService memberExportService;
    private final MemberImportService memberImportService;

    /** 프로필 / 설정 (화면 4) */
    @GetMapping
    public MeResponse me(@LoginMember Long memberId) {
        return meQueryService.findMe(memberId);
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

}

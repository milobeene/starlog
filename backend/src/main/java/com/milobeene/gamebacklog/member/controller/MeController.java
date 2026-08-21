package com.milobeene.gamebacklog.member.controller;

import com.milobeene.gamebacklog.common.web.LoginMember;
import com.milobeene.gamebacklog.member.dto.MeResponse;
import com.milobeene.gamebacklog.member.dto.OptionsResponse;
import com.milobeene.gamebacklog.member.dto.ProfileUpdateRequest;
import com.milobeene.gamebacklog.member.service.MeQueryService;
import com.milobeene.gamebacklog.member.service.MemberService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
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
}

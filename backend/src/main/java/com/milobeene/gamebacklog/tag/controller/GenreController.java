package com.milobeene.gamebacklog.tag.controller;

import com.milobeene.gamebacklog.common.web.LoginMember;
import com.milobeene.gamebacklog.tag.dto.NameRequest;
import com.milobeene.gamebacklog.tag.service.GenreService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 개인 장르 사전 관리 (FR-TAG-05). 태그와 같은 메커니즘이다 */
@RestController
@RequestMapping("/api/me/genres")
@RequiredArgsConstructor
public class GenreController {

    private final GenreService genreService;

    @PutMapping("/{genreId}")
    public void rename(@LoginMember Long memberId, @PathVariable Long genreId,
                       @Valid @RequestBody NameRequest request) {
        genreService.rename(memberId, genreId, request.name());
    }

    /** 삭제하면 그 장르를 쓰던 항목은 마스터 장르로 폴백된다 */
    @DeleteMapping("/{genreId}")
    public ResponseEntity<Void> delete(@LoginMember Long memberId, @PathVariable Long genreId) {
        genreService.delete(memberId, genreId);

        return ResponseEntity.noContent().build();
    }
}

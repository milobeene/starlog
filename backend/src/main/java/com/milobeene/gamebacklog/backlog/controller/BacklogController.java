package com.milobeene.gamebacklog.backlog.controller;

import com.milobeene.gamebacklog.backlog.dto.BacklogAddRequest;
import com.milobeene.gamebacklog.backlog.dto.BacklogCardResponse;
import com.milobeene.gamebacklog.backlog.dto.BacklogDetailResponse;
import com.milobeene.gamebacklog.backlog.dto.BacklogSort;
import com.milobeene.gamebacklog.backlog.dto.FacetsResponse;
import com.milobeene.gamebacklog.backlog.dto.NameListRequest;
import com.milobeene.gamebacklog.backlog.dto.OverrideUpdateRequest;
import com.milobeene.gamebacklog.backlog.dto.PersonalRecordRequest;
import com.milobeene.gamebacklog.backlog.service.BacklogFacetQueryService;
import com.milobeene.gamebacklog.backlog.service.BacklogService;
import com.milobeene.gamebacklog.common.dto.IdResponse;
import com.milobeene.gamebacklog.game.service.GameResolver;
import com.milobeene.gamebacklog.tag.service.GenreService;
import com.milobeene.gamebacklog.tag.service.TagService;
import com.milobeene.gamebacklog.backlog.service.BacklogQueryService;
import com.milobeene.gamebacklog.common.dto.PageResponse;
import com.milobeene.gamebacklog.common.web.LoginMember;
import lombok.RequiredArgsConstructor;

import java.net.URI;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/backlog")
@RequiredArgsConstructor
public class BacklogController {

    private final BacklogQueryService backlogQueryService;
    private final BacklogFacetQueryService backlogFacetQueryService;
    private final BacklogService backlogService;
    private final GameResolver gameResolver;
    private final TagService tagService;
    private final GenreService genreService;

    /**
     * 백로그 목록 (화면 1). 검색·필터는 L-1(QueryDSL) 몫이라 지금은 페이징·정렬만이다.
     *
     * memberId를 @RequestParam으로 받지 않는 이유 — URL 설계가 오염되고
     * Phase 3에서 전 경로를 고쳐야 한다. 리졸버가 헤더에서 꺼내 넣는다
     */
    @GetMapping
    public PageResponse<BacklogCardResponse> list(
            @LoginMember Long memberId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "lastPlayed") String sort) {

        return backlogQueryService.findCards(memberId, page, size, BacklogSort.from(sort));
    }

    /** 필터 사이드바 (화면 1 부속). 목록과 분리해서 페이지를 넘겨도 다시 안 센다 */
    @GetMapping("/facets")
    public FacetsResponse facets(@LoginMember Long memberId) {
        return backlogFacetQueryService.findFacets(memberId);
    }

    /** 상세 (화면 2). 없거나 남의 것이면 404 — 403을 주면 id의 존재가 새어나간다 */
    @GetMapping("/{entryId}")
    public BacklogDetailResponse detail(@LoginMember Long memberId, @PathVariable Long entryId) {
        return backlogQueryService.findDetail(memberId, entryId);
    }

    /**
     * 백로그에 담기 (FR-BL-01).
     *
     * 삭제된 항목이 이미 있으면 서비스가 RevivableEntryException을 던지고,
     * 전역 핸들러가 409 + reviveUrl로 바꾼다. 컨트롤러는 그 분기를 몰라도 된다.
     *
     * 두 서비스를 여기서 이어 붙이는 이유 (J-3) — resolve는 RAWG를 부를 수 있어
     * 트랜잭션 밖에 있어야 하고, addToBacklog는 트랜잭션 안이어야 한다.
     * 한 서비스로 합치면 HTTP 왕복 내내 DB 커넥션을 붙잡는다.
     * RAWG가 죽으면 resolve에서 502로 끝나므로 백로그 쪽은 아무것도 쓰지 않는다 (FR-SYS-04)
     */
    @PostMapping
    public ResponseEntity<IdResponse> add(@LoginMember Long memberId,
                                          @Valid @RequestBody BacklogAddRequest request) {
        Long gameId = gameResolver.resolve(request.gameId(), request.rawgId());
        Long entryId = backlogService.addToBacklog(memberId, gameId);

        return ResponseEntity.created(URI.create("/api/backlog/" + entryId))
                .body(IdResponse.of(entryId));
    }

    /** 되살리기 (§7.4). 멱등하지 않아서(이미 살아있으면 409) PUT이 아니라 POST다 */
    @PostMapping("/{entryId}/revive")
    public void revive(@LoginMember Long memberId, @PathVariable Long entryId) {
        backlogService.revive(memberId, entryId);
    }

    /** 소프트 삭제 (FR-BL-08). 회차·취득은 부모가 숨겨지면 같이 숨는다 */
    @DeleteMapping("/{entryId}")
    public ResponseEntity<Void> delete(@LoginMember Long memberId, @PathVariable Long entryId) {
        backlogService.delete(memberId, entryId);

        return ResponseEntity.noContent().build();
    }

    /** 개인 기록 전체 교체 (FR-BL-05~07) */
    @PutMapping("/{entryId}/personal-record")
    public void updatePersonalRecord(@LoginMember Long memberId, @PathVariable Long entryId,
                                     @Valid @RequestBody PersonalRecordRequest request) {
        backlogService.updatePersonalRecord(memberId, entryId,
                request.rating(), request.playTimeHours(), request.memo());
    }

    /** 오버라이드 전체 교체 (FR-BL-03, 04) */
    @PutMapping("/{entryId}/overrides")
    public void updateOverrides(@LoginMember Long memberId, @PathVariable Long entryId,
                                @Valid @RequestBody OverrideUpdateRequest request) {
        backlogService.updateOverrides(memberId, entryId, request.toCommand());
    }

    /** 태그 전체 교체 (FR-TAG-01). 사전에 없는 이름은 적는 순간 생긴다 (§6.7) */
    @PutMapping("/{entryId}/tags")
    public void replaceTags(@LoginMember Long memberId, @PathVariable Long entryId,
                            @Valid @RequestBody NameListRequest request) {
        tagService.replaceTags(memberId, entryId, request.names());
    }

    /** 개인 장르 전체 교체 (FR-TAG-05). 비우면 마스터 장르로 폴백된다 */
    @PutMapping("/{entryId}/genres")
    public void replaceGenres(@LoginMember Long memberId, @PathVariable Long entryId,
                              @Valid @RequestBody NameListRequest request) {
        genreService.replaceGenres(memberId, entryId, request.names());
    }
}

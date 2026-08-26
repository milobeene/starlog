package com.milobeene.starlog.backlog.controller;

import com.milobeene.starlog.backlog.domain.BacklogStatus;
import com.milobeene.starlog.backlog.dto.BacklogAddRequest;
import com.milobeene.starlog.backlog.dto.BacklogCardResponse;
import com.milobeene.starlog.backlog.dto.BacklogDetailResponse;
import com.milobeene.starlog.backlog.dto.BacklogNameResponse;
import com.milobeene.starlog.backlog.dto.DeletedEntryResponse;
import com.milobeene.starlog.backlog.dto.CompanyDictionary;
import com.milobeene.starlog.backlog.dto.BacklogSearchCondition;
import com.milobeene.starlog.backlog.dto.BacklogSort;
import com.milobeene.starlog.backlog.dto.CoverConfirmRequest;
import com.milobeene.starlog.backlog.dto.CoverUploadUrlRequest;
import com.milobeene.starlog.backlog.dto.CoverUploadUrlResponse;
import com.milobeene.starlog.backlog.service.CoverImageService;
import com.milobeene.starlog.backlog.dto.FacetsResponse;
import com.milobeene.starlog.backlog.dto.NameListRequest;
import com.milobeene.starlog.backlog.dto.TagUpdateRequest;
import com.milobeene.starlog.backlog.dto.OverrideUpdateRequest;
import com.milobeene.starlog.backlog.dto.PersonalRecordRequest;
import com.milobeene.starlog.backlog.service.BacklogFacetQueryService;
import com.milobeene.starlog.backlog.service.BacklogService;
import com.milobeene.starlog.common.dto.IdResponse;
import com.milobeene.starlog.common.quota.QuotaGuard;
import com.milobeene.starlog.common.quota.QuotaKind;
import com.milobeene.starlog.game.service.GameResolver;
import com.milobeene.starlog.tag.service.GenreService;
import com.milobeene.starlog.tag.service.TagService;
import com.milobeene.starlog.backlog.service.BacklogQueryService;
import com.milobeene.starlog.common.dto.PageResponse;
import com.milobeene.starlog.common.web.LoginMember;
import lombok.RequiredArgsConstructor;

import java.net.URI;
import java.util.List;
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
    private final CoverImageService coverImageService;
    private final TagService tagService;
    private final GenreService genreService;
    /*
     * WEB-ONLY: 일일 쿼터 (docs/web-only-inventory.md).
     *
     * **컨트롤러에 두는 이유** — 쿼터는 도메인 규칙이 아니라 "한 서버를 여럿이 나눠 쓴다"에서
     * 나온 웹 엣지의 정책이다. 서비스 안에 넣으면 로컬 앱으로 갈 때 도메인을 헤집어야 한다.
     * 여기 있으면 이 줄들만 지우면 된다
     */
    private final QuotaGuard quotaGuard;

    /**
     * 백로그 목록 (화면 1). 검색·필터·정렬·페이징 (FR-QRY-01~04).
     *
     * memberId를 @RequestParam으로 받지 않는 이유 — URL 설계가 오염되고
     * Phase 3에서 전 경로를 고쳐야 한다. 리졸버가 헤더에서 꺼내 넣는다.
     *
     * status가 List인 이유 — `?status=PLAYING&status=BACKLOG`로 복수 선택이 온다.
     * 없는 enum 값이 오면 스프링이 변환에서 막고 전역 핸들러가 400으로 바꾼다
     */
    @GetMapping
    public PageResponse<BacklogCardResponse> list(
            @LoginMember Long memberId,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) List<BacklogStatus> status,
            @RequestParam(required = false) Long tagId,
            @RequestParam(required = false) Long genreId,
            @RequestParam(required = false) String genreName,
            @RequestParam(required = false) String developer,
            @RequestParam(required = false) Integer releaseYear,
            @RequestParam(required = false) Long deviceId,
            @RequestParam(required = false) Long platformId,
            @RequestParam(required = false) Long platformAccountId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "lastPlayed") String sort) {

        BacklogSearchCondition condition = new BacklogSearchCondition(
                q, status, tagId, genreId, genreName, developer, releaseYear,
                deviceId, platformId, platformAccountId);

        return backlogQueryService.findCards(memberId, condition, page, size, BacklogSort.from(sort));
    }

    /** 필터 사이드바 (화면 1 부속). 목록과 분리해서 페이지를 넘겨도 다시 안 센다 */
    @GetMapping("/facets")
    public FacetsResponse facets(@LoginMember Long memberId) {
        return backlogFacetQueryService.findFacets(memberId);
    }

    /**
     * 사이드바 전체 목록 (Phase 8). 이름순, 페이징 없음.
     * "/names"가 "/{entryId}"보다 먼저 매칭된다 — 리터럴 경로가 패스 변수보다 우선이다
     */
    @GetMapping("/names")
    public List<BacklogNameResponse> names(@LoginMember Long memberId) {
        return backlogQueryService.findNames(memberId);
    }

    /**
     * 삭제한 항목 목록 (§7.4).
     *
     * 되살리기 자체는 예전부터 있었지만 **들어가는 문이 담기 화면 하나뿐이었다** —
     * 같은 게임을 다시 담으려 할 때만 "되살릴까요"가 떴다. 그래서 사용자 눈에는
     * 되돌릴 방법이 없어 보였다. 이 목록이 그 문을 하나 더 낸다
     */
    @GetMapping("/deleted")
    public List<DeletedEntryResponse> deleted(@LoginMember Long memberId) {
        return backlogQueryService.findDeleted(memberId);
    }

    /** 개발사·유통사 사전 (Phase 8) — 필터·편집 폼의 자동완성 선택지 */
    @GetMapping("/companies")
    public CompanyDictionary companies(@LoginMember Long memberId) {
        return backlogQueryService.findCompanies(memberId);
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
     * 두 서비스를 여기서 이어 붙이는 이유 (J-3) — resolve는 외부 DB를 부를 수 있어
     * 트랜잭션 밖에 있어야 하고, addToBacklog는 트랜잭션 안이어야 한다.
     * 한 서비스로 합치면 HTTP 왕복 내내 DB 커넥션을 붙잡는다.
     * 외부 DB가 죽으면 resolve에서 502로 끝나므로 백로그 쪽은 아무것도 쓰지 않는다 (FR-SYS-04)
     */
    @PostMapping
    public ResponseEntity<IdResponse> add(@LoginMember Long memberId,
                                          @Valid @RequestBody BacklogAddRequest request) {
        quotaGuard.consume(memberId, QuotaKind.GAME_ADD);   // WEB-ONLY

        Long gameId = gameResolver.resolve(request.gameId(), request.externalId());
        Long entryId = backlogService.addToBacklog(memberId, gameId);

        return ResponseEntity.created(URI.create("/api/backlog/" + entryId))
                .body(IdResponse.of(entryId));
    }

    /**
     * 커버 업로드 1단계 — 허가증 발급 (FR-MED-01, K-2).
     *
     * 파일이 서버를 거치지 않는다. 무료 티어 메모리(512MB)와 요청 점유 시간 때문이다 (§6.10).
     * 프론트는 받은 uploadUrl로 직접 PUT하고, Content-Type은 **응답의 contentType 그대로** 써야 한다 —
     * 서명에 포함된 값이라 다르면 스토리지가 403을 준다
     */
    @PostMapping("/{entryId}/cover/upload-url")
    public CoverUploadUrlResponse issueCoverUploadUrl(
            @LoginMember Long memberId, @PathVariable Long entryId,
            @Valid @RequestBody CoverUploadUrlRequest request) {
        quotaGuard.consume(memberId, QuotaKind.COVER_UPLOAD);   // WEB-ONLY

        return coverImageService.issueUploadUrl(
                memberId, entryId, request.fileName(), request.sizeBytes());
    }

    /**
     * 커버 업로드 2단계 — 확정 (K-2, K-3).
     *
     * PUT인 이유 — 같은 storageKey로 여러 번 불러도 결과가 같다. 교체도 이 경로다.
     * 서버는 클라이언트의 "올렸어요"를 믿지 않고 HEAD와 매직 넘버로 실물을 확인한다
     */
    @PutMapping("/{entryId}/cover")
    public void confirmCover(@LoginMember Long memberId, @PathVariable Long entryId,
                             @Valid @RequestBody CoverConfirmRequest request) {
        coverImageService.confirm(memberId, entryId, request.storageKey());
    }

    /** 커버 삭제 (FR-MED-03). 마스터 커버로 폴백된다 */
    @DeleteMapping("/{entryId}/cover")
    public ResponseEntity<Void> deleteCover(@LoginMember Long memberId, @PathVariable Long entryId) {
        coverImageService.delete(memberId, entryId);

        return ResponseEntity.noContent().build();
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

    /** 태그 교체 (FR-TAG-01). 항목당 하나이고, 사전에 없는 이름은 적는 순간 생긴다 (§6.7) */
    @PutMapping("/{entryId}/tag")
    public void changeTag(@LoginMember Long memberId, @PathVariable Long entryId,
                          @Valid @RequestBody TagUpdateRequest request) {
        tagService.changeTag(memberId, entryId, request.name());
    }

    /** 개인 장르 전체 교체 (FR-TAG-05). 비우면 마스터 장르로 폴백된다 */
    @PutMapping("/{entryId}/genres")
    public void replaceGenres(@LoginMember Long memberId, @PathVariable Long entryId,
                              @Valid @RequestBody NameListRequest request) {
        genreService.replaceGenres(memberId, entryId, request.names());
    }
}

package com.milobeene.starlog.backlog.controller;

import com.milobeene.starlog.backlog.domain.BacklogStatus;
import com.milobeene.starlog.backlog.dto.BacklogAddRequest;
import com.milobeene.starlog.backlog.dto.BacklogCardResponse;
import com.milobeene.starlog.backlog.dto.BacklogDetailResponse;
import com.milobeene.starlog.backlog.dto.BacklogNameResponse;
import com.milobeene.starlog.backlog.dto.DeletedEntryResponse;
import com.milobeene.starlog.backlog.dto.DeletedEntryDetailResponse;
import com.milobeene.starlog.backlog.dto.CompanyDictionary;
import com.milobeene.starlog.backlog.dto.BacklogSearchCondition;
import com.milobeene.starlog.backlog.dto.BacklogSort;
import com.milobeene.starlog.backlog.dto.CoverConfirmRequest;
import com.milobeene.starlog.backlog.dto.CoverUploadUrlRequest;
import com.milobeene.starlog.backlog.dto.CoverUploadTarget;
import com.milobeene.starlog.backlog.dto.ScreenshotResponse;
import com.milobeene.starlog.backlog.service.CoverImageService;
import com.milobeene.starlog.backlog.service.MediaFileValidator;
import com.milobeene.starlog.backlog.service.ScreenshotService;
import com.milobeene.starlog.backlog.dto.FacetsResponse;
import com.milobeene.starlog.backlog.dto.NameListRequest;
import com.milobeene.starlog.backlog.dto.TagUpdateRequest;
import com.milobeene.starlog.backlog.dto.OverrideUpdateRequest;
import com.milobeene.starlog.backlog.dto.PersonalRecordRequest;
import com.milobeene.starlog.backlog.service.BacklogFacetQueryService;
import com.milobeene.starlog.backlog.service.BacklogService;
import com.milobeene.starlog.common.dto.IdResponse;
import com.milobeene.starlog.game.service.GameResolver;
import com.milobeene.starlog.tag.service.GenreService;
import com.milobeene.starlog.tag.service.TagService;
import com.milobeene.starlog.backlog.service.BacklogQueryService;
import com.milobeene.starlog.common.dto.PageResponse;
import com.milobeene.starlog.common.web.LoginMember;
import lombok.RequiredArgsConstructor;

import java.net.URI;
import java.util.List;
import java.util.Map;
import jakarta.validation.Valid;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
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
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

@RestController
@RequestMapping("/api/backlog")
@RequiredArgsConstructor
public class BacklogController {

    private final BacklogQueryService backlogQueryService;
    private final BacklogFacetQueryService backlogFacetQueryService;
    private final BacklogService backlogService;
    private final GameResolver gameResolver;
    private final CoverImageService coverImageService;
    private final ScreenshotService screenshotService;
    private final TagService tagService;
    private final GenreService genreService;

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
    public PageResponse<DeletedEntryResponse> deleted(
            @LoginMember Long memberId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {

        return backlogQueryService.findDeleted(memberId, page, size);
    }

    /**
     * 삭제한 항목 미리보기 (§7.4).
     *
     * 완전 삭제 버튼 옆에 붙는 창이다 — **되돌릴 수 없는 일 앞에서 "이게 뭐였지"를
     * 확인할 수 있어야 한다.** 목록의 이름만으로는 회차 30개짜리인지 담고 만 것인지 모른다
     */
    @GetMapping("/deleted/{entryId}")
    public DeletedEntryDetailResponse deletedDetail(@LoginMember Long memberId,
                                                    @PathVariable Long entryId) {
        return backlogQueryService.findDeletedDetail(memberId, entryId);
    }

    /**
     * **완전 삭제** (§7.4). 되돌릴 수 없다.
     *
     * 이미 소프트 삭제된 항목만 지운다 — 라이브러리에 살아 있는 게임이 실수로 한 방에
     * 사라지는 경로를 만들지 않는다. 휴지통을 한 번 거쳐야 한다
     */
    @DeleteMapping("/deleted/{entryId}")
    public ResponseEntity<Void> purge(@LoginMember Long memberId, @PathVariable Long entryId) {
        backlogService.purge(memberId, entryId);
        return ResponseEntity.noContent().build();
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
    public CoverUploadTarget prepareCoverUpload(
            @LoginMember Long memberId, @PathVariable Long entryId,
            @Valid @RequestBody CoverUploadUrlRequest request) {
        return coverImageService.prepare(
                memberId, entryId, request.fileName(), request.sizeBytes());
    }

    /**
     * 커버 업로드 2단계 — 확정 (K-2, K-3). **EXTERNAL 경로에서만 쓴다.**
     *
     * PUT인 이유 — 같은 storageKey로 여러 번 불러도 결과가 같다. 교체도 이 경로다.
     * 서버는 클라이언트의 "올렸어요"를 믿지 않고 HEAD와 매직 넘버로 실물을 확인한다
     */
    @PutMapping("/{entryId}/cover")
    public void confirmCover(@LoginMember Long memberId, @PathVariable Long entryId,
                             @Valid @RequestBody CoverConfirmRequest request) {
        coverImageService.confirmExternal(memberId, entryId, request.storageKey());
    }

    /**
     * LOCAL 업로드 (v1.0 6단계). 바이트가 백엔드를 지나간다.
     *
     * 프리사인드를 쓰던 이유(무료 티어 메모리 512MB)가 데스크탑에는 없다 —
     * 커버는 최대 5MB고 올리는 사람은 한 명이다. 대신 **왕복이 셋에서 하나로 줄었다**
     */
    @PostMapping("/{entryId}/cover/file")
    public void uploadCoverFile(@LoginMember Long memberId, @PathVariable Long entryId,
                                @RequestParam("file") MultipartFile file) throws IOException {
        coverImageService.saveLocal(
                memberId, entryId, file.getOriginalFilename(), file.getBytes());
    }

    /**
     * LOCAL 커버 원본.
     *
     * `?v=` 쿼리는 서버가 안 읽는다 — **브라우저 캐시를 깨려고** URL에 넣는 값이라
     * 여기서는 존재만으로 제 몫을 한다. 커버를 교체해도 주소가 같아서 안 붙이면 옛 그림이 남는다
     */
    @GetMapping("/{entryId}/cover/file")
    public ResponseEntity<byte[]> coverFile(@LoginMember Long memberId,
                                            @PathVariable Long entryId) {
        CoverImageService.LocalFile file = coverImageService.readLocal(memberId, entryId);
        return ResponseEntity.ok()
                .header("Content-Type", file.contentType())
                .header("Cache-Control", "private, max-age=31536000, immutable")
                .body(file.bytes());
    }

    /** 커버 삭제 (FR-MED-03). 마스터 커버로 폴백된다 */
    @DeleteMapping("/{entryId}/cover")
    public ResponseEntity<Void> deleteCover(@LoginMember Long memberId, @PathVariable Long entryId) {
        coverImageService.delete(memberId, entryId);

        return ResponseEntity.noContent().build();
    }

    // ───────────────────────── 스크린샷 (v1.0 7단계) ─────────────────────────

    /**
     * 목록.
     *
     * **DB를 안 본다 — 폴더를 읽는다.** 캡션도 순서도 없으니 저장할 게 파일 말고 없고,
     * 탐색기 열기를 주기로 한 이상 사람이 직접 지운다는 뜻이라 파일이 진실이어야 한다
     */
    @GetMapping("/{entryId}/screenshots")
    public List<ScreenshotResponse> screenshots(@LoginMember Long memberId,
                                                @PathVariable Long entryId) {
        return screenshotService.list(memberId, entryId);
    }

    /**
     * 한 장 저장. 드롭·클릭·붙여넣기가 전부 이 경로로 온다. **영상도 같은 문으로 들어온다.**
     *
     * `takenAt`은 브라우저가 읽은 **원본 파일의 수정시각**이다. 이게 없으면 옛 스크린샷을
     * 한꺼번에 넣었을 때 전부 "지금"이 되어 순서가 뭉개진다
     */
    @PostMapping("/{entryId}/screenshots")
    public ScreenshotResponse addScreenshot(@LoginMember Long memberId,
                                            @PathVariable Long entryId,
                                            @RequestParam("file") MultipartFile file,
                                            @RequestParam(required = false) Long takenAt)
            throws IOException {
        return screenshotService.save(
                memberId, entryId, file.getOriginalFilename(), file.getBytes(), takenAt);
    }

    /**
     * 원본. 이름이 경로에 들어가므로 서비스가 폴더 밖으로 못 나가게 막는다.
     *
     * ## `byte[]`가 아니라 `Resource`다 (2026-08-28)
     *
     * 영상 상한이 200MB다. `byte[]`로 내보내면 **읽은 배열 + 응답 버퍼**로 힙을 두 벌
     * 잡을 뿐 아니라, Range 요청을 처리할 방법이 없어 **재생 막대를 끌 수가 없다.**
     * `Resource`를 돌려주면 스프링(`HttpEntityMethodProcessor`)이 Range 헤더를 보고
     * 필요한 구간만 잘라 보낸다 — `Accept-Ranges`를 켜줘야 브라우저가 시도한다
     */
    @GetMapping("/{entryId}/screenshots/{fileName}")
    public ResponseEntity<Resource> screenshot(@LoginMember Long memberId,
                                               @PathVariable Long entryId,
                                               @PathVariable String fileName) {
        /*
         * DB에 행이 없어 타입을 저장해둔 곳이 없다 → 확장자에서 되돌린다.
         * 저장할 때 확장자와 매직 넘버를 대조했으므로 확장자를 믿어도 된다.
         * **영상은 이게 없으면 브라우저가 재생을 아예 안 한다**
         */
        return ResponseEntity.ok()
                .header("Content-Type", MediaFileValidator.contentTypeOf(fileName))
                .header("Cache-Control", "private, max-age=31536000, immutable")
                .header("Accept-Ranges", "bytes")
                .body(new FileSystemResource(
                        screenshotService.resolve(memberId, entryId, fileName)));
    }

    /**
     * 일괄 삭제 (architecture §10-1 "보기와 삭제만 준다").
     *
     * DELETE에 본문을 싣는 건 규격상 회색지대라 POST로 받는다 —
     * 이름을 쿼리로 나열하면 수십 장을 고를 때 URL 길이에 걸린다
     */
    @PostMapping("/{entryId}/screenshots/delete")
    public Map<String, Integer> deleteScreenshots(@LoginMember Long memberId,
                                                  @PathVariable Long entryId,
                                                  @RequestBody List<String> fileNames) {
        return Map.of("deleted", screenshotService.delete(memberId, entryId, fileNames));
    }

    /**
     * 스크린샷 폴더의 실제 경로.
     *
     * **일렉트론이 탐색기로 연다** — 브라우저는 로컬 경로를 못 여니 이 값은 데스크탑에서만 쓰인다.
     * 서버가 경로를 알려주고 여는 건 네이티브 쪽이 한다 (architecture §2 경계표)
     */
    @GetMapping("/{entryId}/screenshots/folder")
    public Map<String, String> screenshotFolder(@LoginMember Long memberId,
                                                @PathVariable Long entryId) {
        return Map.of("path", screenshotService.folderPath(memberId, entryId));
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

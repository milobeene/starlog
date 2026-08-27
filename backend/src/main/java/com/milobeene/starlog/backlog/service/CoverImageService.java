package com.milobeene.starlog.backlog.service;

import com.milobeene.starlog.backlog.domain.CoverImage;
import com.milobeene.starlog.backlog.domain.CoverLocation;
import com.milobeene.starlog.backlog.dto.CoverUploadTarget;
import com.milobeene.starlog.common.exception.InvalidInputException;
import com.milobeene.starlog.common.storage.FileStoragePort;
import com.milobeene.starlog.common.storage.LocalFileStore;
import com.milobeene.starlog.common.storage.MediaPaths;
import com.milobeene.starlog.common.storage.MediaTargets;
import com.milobeene.starlog.common.storage.PresignedUpload;
import com.milobeene.starlog.common.storage.StorageProperties;
import com.milobeene.starlog.common.storage.StoredObject;
import com.milobeene.starlog.common.util.TextValues;
import com.milobeene.starlog.system.domain.ApiProvider;
import com.milobeene.starlog.system.service.ApiCallRecorder;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

/**
 * 커버 업로드 오케스트레이션 (K-2 ~ K-4 + v1.0 6단계).
 *
 * **@Transactional이 없는 것이 설계다.** 여기서 스토리지·파일시스템을 왕복하고,
 * DB는 CoverRecordService가 짧은 트랜잭션으로 처리한다.
 *
 * ## v1.0에서 업로드 경로가 둘이 됐다 (architecture §4 ⚠️)
 *
 * <pre>
 *   EXTERNAL  허가증 발급 → 브라우저가 스토리지에 직접 PUT → 확정   (3단계)
 *   LOCAL     브라우저가 백엔드로 바이트 전송 → 백엔드가 파일로 씀   (1단계)
 * </pre>
 *
 * **어느 쪽인지는 클라이언트가 정하지 않는다.** `prepare()`가 답해주고 화면은 따라간다 —
 * 판정에 필요한 것(자격증명이 있나, 체크박스가 켜졌나)이 전부 서버에 있기 때문이다
 */
@Service
@RequiredArgsConstructor
public class CoverImageService {

    private final CoverRecordService coverRecordService;
    private final CoverImageValidator validator;
    private final FileStoragePort fileStorage;
    private final StorageProperties storageProperties;
    private final LocalFileStore localFileStore;
    private final MediaPaths mediaPaths;
    private final MediaTargets mediaTargets;
    private final ApiCallRecorder apiCallRecorder;

    /**
     * 0단계 — **어디에 어떻게 올릴지 묻는다.**
     *
     * EXTERNAL이면 허가증까지 함께 준다(왕복을 하나 아낀다). LOCAL이면 "그냥 나한테 보내라"만 답한다
     */
    public CoverUploadTarget prepare(Long memberId, Long entryId, String fileName, long sizeBytes) {
        coverRecordService.requireOwned(memberId, entryId);

        String contentType = validator.validateAndResolveContentType(
                fileName, sizeBytes, storageProperties.maxUploadBytes());

        if (mediaTargets.forCover() == CoverLocation.LOCAL) {
            return CoverUploadTarget.local(contentType);
        }

        String storageKey = newStorageKey(memberId, entryId, fileName);
        PresignedUpload upload = fileStorage.presignUpload(
                storageKey, contentType, sizeBytes, storageProperties.uploadUrlTtl());

        return CoverUploadTarget.external(upload.uploadUrl(), upload.storageKey(),
                contentType, upload.expiresIn().toSeconds());
    }

    /**
     * EXTERNAL 확정 (K-2, K-3).
     *
     * 서버는 업로드 성공 여부를 모르므로 클라이언트가 알려줘야 한다. 그 말을 믿지 않고
     * HEAD로 실물을 확인하고 앞 12바이트로 형식을 판정한다
     */
    public void confirmExternal(Long memberId, Long entryId, String rawKey) {
        coverRecordService.requireOwned(memberId, entryId);

        String storageKey = TextValues.normalize(rawKey);
        if (storageKey == null) {
            throw new InvalidInputException("storageKey는 필수입니다");
        }

        /*
         * **남의 key를 확정하려는 시도를 여기서 막는다.** key는 클라이언트가 되돌려주는 값이라,
         * 검사하지 않으면 다른 경로를 넣어 그 파일을 자기 항목 커버로 붙일 수 있다.
         * 로그인이 사라져 "남"이 없어졌지만 검사는 남긴다 — 경로 오타를 그대로 붙이는 것도 막는다
         */
        String expectedPrefix = keyPrefix(memberId, entryId);
        if (!storageKey.startsWith(expectedPrefix)) {
            throw new InvalidInputException("이 항목의 업로드 경로가 아닙니다");
        }

        StoredObject stored = head(storageKey);
        byte[] head = fileStorage.readHead(storageKey, CoverImageValidator.MAGIC_LENGTH);

        // contentType은 스토리지가 기록한 값이 아니라 **확장자에서 우리가 정한 값**을 기준으로 본다.
        // 스토리지가 기록한 헤더도 결국 클라이언트가 보낸 값이라 근거가 못 된다
        String contentType = validator.validateAndResolveContentType(
                storageKey, stored.sizeBytes(), storageProperties.maxUploadBytes());
        validator.validateStored(stored.sizeBytes(), storageProperties.maxUploadBytes(),
                head, contentType);

        Optional<CoverImage.Replaced> previous = coverRecordService.attach(
                memberId, entryId, storageKey, contentType, stored.sizeBytes(),
                CoverLocation.EXTERNAL);

        /*
         * 커밋이 끝난 뒤에 지운다. 반대로 하면 DB엔 남았는데 파일이 없는 상태가 생긴다.
         *
         * **같은 키면 지우지 않는다.** PUT은 멱등 메서드라 브라우저·프록시가 재시도할 수 있는데,
         * 그때 옛 key와 새 key가 같아진다. 걸러내지 않으면 방금 DB에 붙인 바로 그 객체를
         * 지워서 DB 행만 남은 깨진 커버가 된다
         */
        previous.filter(p -> !(p.location() == CoverLocation.EXTERNAL
                        && p.storageKey().equals(storageKey)))
                .ifPresent(this::removeFile);
    }

    /**
     * LOCAL 저장 (v1.0 6단계).
     *
     * 바이트가 백엔드를 지나간다 — 프리사인드를 쓰던 이유(무료 티어 메모리 512MB)가
     * 데스크탑에는 없다. 커버는 최대 5MB고 올리는 사람은 한 명이다
     */
    public void saveLocal(Long memberId, Long entryId, String fileName, byte[] bytes) {
        coverRecordService.requireOwned(memberId, entryId);

        String contentType = validator.validateAndResolveContentType(
                fileName, bytes.length, storageProperties.maxUploadBytes());
        // 확장자만 믿지 않는다 — 매직 넘버로 실제 형식을 확인한다 (K-3과 같은 검사)
        validator.validateStored(bytes.length, storageProperties.maxUploadBytes(),
                bytes, contentType);

        String stored = localFileStore.save(mediaPaths.covers(), bytes, extensionOf(fileName));

        Optional<CoverImage.Replaced> previous = coverRecordService.attach(
                memberId, entryId, stored, contentType, bytes.length, CoverLocation.LOCAL);

        previous.ifPresent(this::removeFile);
    }

    /**
     * 로컬 커버 원본. 화면이 `/api/backlog/{id}/cover/file`로 받아 간다.
     *
     * **타입을 같이 준다.** 안 주면 `application/octet-stream`으로 나가는데,
     * `<img>`는 내용을 보고 알아서 그려도 **새 탭에서 열면 다운로드가 된다.**
     * DB에 이미 확장자에서 판정한 값이 있으니 그걸 쓴다
     */
    public LocalFile readLocal(Long memberId, Long entryId) {
        CoverImage cover = coverRecordService.find(memberId, entryId)
                .filter(c -> c.getLocation() == CoverLocation.LOCAL)
                .orElseThrow(() -> new InvalidInputException("로컬 커버가 없습니다"));

        return new LocalFile(
                localFileStore.read(mediaPaths.covers(), cover.getStorageKey()),
                cover.getContentType());
    }

    /** 바이트와 타입은 짝이다 — 따로 다니면 한쪽을 빠뜨린다 */
    public record LocalFile(byte[] bytes, String contentType) {}

    /**
     * 삭제 (K-4, FR-MED-03).
     *
     * **DB 커밋 → 파일 삭제 순서다.** 뒤집으면 파일은 없는데 DB엔 남는 최악이 나온다.
     * 이 순서에서 최악은 고아 파일이 남는 것뿐이다
     */
    public void delete(Long memberId, Long entryId) {
        coverRecordService.detach(memberId, entryId).ifPresent(this::removeFile);
    }

    /**
     * 표시용 URL.
     *
     * **위치에 따라 완전히 다른 주소다** — EXTERNAL은 버킷의 공개 URL이고,
     * LOCAL은 우리 백엔드의 엔드포인트다. `?v=`를 붙이는 이유는 커버를 교체해도
     * 주소가 같아서 **브라우저가 옛 그림을 계속 보여주기** 때문이다
     */
    public String publicUrl(CoverImage cover) {
        if (cover == null) {
            return null;
        }
        if (cover.getLocation() == CoverLocation.LOCAL) {
            return "/api/backlog/%d/cover/file?v=%s"
                    .formatted(cover.getBacklogEntry().getId(), cover.getStorageKey());
        }
        return fileStorage.publicUrl(cover.getStorageKey());
    }

    private void removeFile(CoverImage.Replaced target) {
        if (target.location() == CoverLocation.LOCAL) {
            localFileStore.delete(mediaPaths.covers(), target.storageKey());
            return;
        }
        fileStorage.delete(target.storageKey());
        apiCallRecorder.record(ApiProvider.STORAGE, "delete", true);
    }

    private StoredObject head(String storageKey) {
        Optional<StoredObject> found = fileStorage.head(storageKey);
        apiCallRecorder.record(ApiProvider.STORAGE, "head", found.isPresent());
        return found.orElseThrow(() -> new InvalidInputException("업로드된 파일이 없습니다"));
    }

    /**
     * `covers/{memberId}/{entryId}/{uuid}.{ext}`
     *
     * uuid를 쓰는 이유는 같은 파일명을 다시 올려도 덮어쓰지 않기 위해서다 (교체 중 원본 유실 방지)
     */
    private String newStorageKey(Long memberId, Long entryId, String fileName) {
        return keyPrefix(memberId, entryId) + UUID.randomUUID() + "." + extensionOf(fileName);
    }

    /**
     * **검증과 같은 문자열에서 확장자를 뽑아야 한다.** 검증(CoverImageValidator)은 strip한
     * 이름을 보는데 여기서 원문을 쓰면 `"cover.png "` 같은 이름에서 확장자가 `"png "`가 되어
     * 키가 `....png `로 만들어진다. 그 키는 확정 단계에서 **항상 400**이 되고, 스토리지에는
     * 아무도 참조하지 않는 객체만 남는다. macOS·리눅스는 파일명 끝 공백을 허용한다
     */
    private String extensionOf(String fileName) {
        String normalized = TextValues.normalize(fileName);
        return normalized.substring(normalized.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
    }

    private String keyPrefix(Long memberId, Long entryId) {
        return "covers/%d/%d/".formatted(memberId, entryId);
    }
}

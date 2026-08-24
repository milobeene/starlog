package com.milobeene.gamebacklog.backlog.service;

import com.milobeene.gamebacklog.backlog.dto.CoverUploadUrlResponse;
import com.milobeene.gamebacklog.common.exception.InvalidInputException;
import com.milobeene.gamebacklog.common.storage.FileStoragePort;
import com.milobeene.gamebacklog.common.storage.PresignedUpload;
import com.milobeene.gamebacklog.common.storage.StorageProperties;
import com.milobeene.gamebacklog.common.storage.StoredObject;
import com.milobeene.gamebacklog.common.util.TextValues;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

/**
 * 커버 업로드 오케스트레이션 (K-2 ~ K-4).
 *
 * **@Transactional이 없는 것이 설계다.** 여기서 스토리지를 왕복하고,
 * DB는 CoverRecordService가 짧은 트랜잭션으로 처리한다.
 * 두 빈으로 나눈 이유는 프록시 자기호출 함정도 있다 — 같은 객체 안에서 부르면 트랜잭션이 안 걸린다
 */
@Service
@RequiredArgsConstructor
public class CoverImageService {

    private final CoverRecordService coverRecordService;
    private final CoverImageValidator validator;
    private final FileStoragePort fileStorage;
    private final StorageProperties storageProperties;

    /**
     * 1단계 — 업로드 허가증 발급 (K-2).
     *
     * presign은 네트워크를 타지 않는다(로컬 서명 계산). 그래도 트랜잭션 밖인 이유는
     * 확정·삭제와 경계를 같게 유지해서 "이 클래스는 트랜잭션이 없다"를 규칙으로 두기 위해서다
     */
    public CoverUploadUrlResponse issueUploadUrl(Long memberId, Long entryId,
                                                 String fileName, long sizeBytes) {
        coverRecordService.requireOwned(memberId, entryId);

        String contentType = validator.validateAndResolveContentType(
                fileName, sizeBytes, storageProperties.maxUploadBytes());

        String storageKey = newStorageKey(memberId, entryId, fileName);

        PresignedUpload upload = fileStorage.presignUpload(
                storageKey, contentType, sizeBytes, storageProperties.uploadUrlTtl());

        return new CoverUploadUrlResponse(upload.uploadUrl(), upload.storageKey(),
                contentType, upload.expiresIn().toSeconds());
    }

    /**
     * 2단계 — 확정 (K-2, K-3).
     *
     * 서버는 업로드 성공 여부를 모르므로 클라이언트가 알려줘야 한다. 그 말을 믿지 않고
     * HEAD로 실물을 확인하고 앞 12바이트로 형식을 판정한다.
     *
     * @return 교체된 경우 지워야 할 예전 key
     */
    public Optional<String> confirm(Long memberId, Long entryId, String rawKey) {
        coverRecordService.requireOwned(memberId, entryId);

        String storageKey = TextValues.normalize(rawKey);
        if (storageKey == null) {
            throw new InvalidInputException("storageKey는 필수입니다");
        }

        /*
         * **남의 key를 확정하려는 시도를 여기서 막는다.**
         * key는 클라이언트가 되돌려주는 값이라, 검사하지 않으면 다른 회원의 경로를 넣어
         * 그 파일을 자기 항목 커버로 붙일 수 있다. 경로에 memberId·entryId를 넣어둔 이유가 이것
         */
        String expectedPrefix = keyPrefix(memberId, entryId);
        if (!storageKey.startsWith(expectedPrefix)) {
            throw new InvalidInputException("이 항목의 업로드 경로가 아닙니다");
        }

        StoredObject stored = fileStorage.head(storageKey)
                .orElseThrow(() -> new InvalidInputException("업로드된 파일이 없습니다"));

        byte[] head = fileStorage.readHead(storageKey, CoverImageValidator.MAGIC_LENGTH);

        // contentType은 스토리지가 기록한 값이 아니라 **확장자에서 우리가 정한 값**을 기준으로 본다.
        // 스토리지가 기록한 헤더도 결국 클라이언트가 보낸 값이라 근거가 못 된다
        String contentType = validator.validateAndResolveContentType(
                storageKey, stored.sizeBytes(), storageProperties.maxUploadBytes());

        validator.validateStored(stored.sizeBytes(), storageProperties.maxUploadBytes(),
                head, contentType);

        Optional<String> previousKey = coverRecordService.attach(
                memberId, entryId, storageKey, contentType, stored.sizeBytes());

        // 커밋이 끝난 뒤에 지운다. 반대로 하면 DB엔 남았는데 파일이 없는 상태가 생긴다
        previousKey.ifPresent(fileStorage::delete);

        return previousKey;
    }

    /**
     * 삭제 (K-4, FR-MED-03).
     *
     * **DB 커밋 → 스토리지 삭제 순서다.** 뒤집으면 파일은 없는데 DB엔 남는 최악이 나온다.
     * 이 순서에서 최악은 고아 파일이 남는 것뿐이고, 그건 버킷 라이프사이클이 정리한다
     */
    public void delete(Long memberId, Long entryId) {
        coverRecordService.detach(memberId, entryId)
                .ifPresent(fileStorage::delete);
    }

    /** 표시용 URL. storageKey만 저장하므로 여기서 조합한다 (K-5) */
    public String publicUrl(String storageKey) {
        return storageKey == null ? null : fileStorage.publicUrl(storageKey);
    }

    /**
     * `covers/{memberId}/{entryId}/{uuid}.{ext}`
     *
     * memberId를 경로에 넣는 이유 둘 — 확정 시 소유권을 경로만으로 검증할 수 있고,
     * 회원 탈퇴 시 prefix 하나로 통째 삭제가 된다.
     * uuid를 쓰는 이유는 같은 파일명을 다시 올려도 덮어쓰지 않기 위해서다 (교체 중 원본 유실 방지)
     */
    private String newStorageKey(Long memberId, Long entryId, String fileName) {
        String extension = fileName.substring(fileName.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);

        return keyPrefix(memberId, entryId) + UUID.randomUUID() + "." + extension;
    }

    private String keyPrefix(Long memberId, Long entryId) {
        return "covers/%d/%d/".formatted(memberId, entryId);
    }
}

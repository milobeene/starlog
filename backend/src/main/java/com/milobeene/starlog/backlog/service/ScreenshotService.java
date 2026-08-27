package com.milobeene.starlog.backlog.service;

import com.milobeene.starlog.backlog.domain.BacklogEntry;
import com.milobeene.starlog.backlog.dto.ScreenshotResponse;
import com.milobeene.starlog.common.exception.InvalidInputException;
import com.milobeene.starlog.common.storage.LocalFileStore;
import com.milobeene.starlog.common.storage.MediaPaths;
import com.milobeene.starlog.common.storage.StorageProperties;
import com.milobeene.starlog.common.util.Slugs;
import com.milobeene.starlog.game.domain.Game;
import com.milobeene.starlog.game.repository.GameRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;

/**
 * 게임별 스크린샷 (v1.0 7단계, architecture §10-1).
 *
 * ## 폴더가 곧 목록이다
 *
 * DB 테이블이 없다. 캡션도 순서도 안 주기로 했으니 저장할 게 파일 말고 없고,
 * **탐색기 열기를 주기로 한 이상 사람이 직접 지운다는 뜻**이라 파일이 진실이어야 한다.
 * 테이블을 두면 "행은 있는데 파일이 없는" 상태를 평생 관리하게 된다.
 *
 * ## 폴더 이름은 게임 이름의 slug
 *
 * `media/hollow-knight/`. 숫자 폴더가 아니라 이름인 건 사용자 결정이다 —
 * 탐색기로 열어볼 물건인데 숫자가 늘어서 있으면 아무것도 못 찾는다.
 * **이름을 마스터에 저장한다**(`Game.mediaFolder`) — 매번 다시 만들면 게임 이름을
 * 한 번 고쳤을 때 폴더를 못 찾아 스크린샷이 사라진 것처럼 보인다
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ScreenshotService {

    private final BacklogEntryFinder entryFinder;
    private final CoverImageValidator validator;
    private final LocalFileStore localFileStore;
    private final MediaPaths mediaPaths;
    private final StorageProperties storageProperties;
    /* 폴더 이름이 겹치는지 본다 — 같은 이름의 게임이 둘 있을 수 있다 */
    private final GameRepository gameRepository;

    public List<ScreenshotResponse> list(Long memberId, Long entryId) {
        Path folder = folderOf(memberId, entryId, false);
        if (folder == null) {
            return List.of();
        }

        return localFileStore.list(folder).stream()
                .map(name -> new ScreenshotResponse(
                        name,
                        "/api/backlog/%d/screenshots/%s".formatted(entryId, name),
                        sizeOf(folder.resolve(name))))
                .toList();
    }

    /**
     * 저장.
     *
     * **파일 이름을 순번으로 붙인다** — 커버(uuid)와 다른 유일한 자리다.
     * 사람이 폴더를 직접 열어볼 물건이라 `a3f9c1....png`가 늘어서 있으면 못 쓴다.
     * 충돌은 이미 있는 번호 다음을 골라 피한다
     */
    @Transactional
    public ScreenshotResponse save(Long memberId, Long entryId, String fileName, byte[] bytes) {
        String contentType = validator.validateAndResolveContentType(
                fileName, bytes.length, storageProperties.maxScreenshotBytes());
        // 확장자만 믿지 않는다 — 매직 넘버로 실제 형식을 확인한다 (K-3과 같은 검사)
        validator.validateStored(bytes.length, storageProperties.maxScreenshotBytes(),
                bytes, contentType);

        Path folder = folderOf(memberId, entryId, true);
        String extension = extensionOf(fileName);
        String stored = nextName(folder, extension);

        localFileStore.saveAs(folder, stored, bytes);

        return new ScreenshotResponse(stored,
                "/api/backlog/%d/screenshots/%s".formatted(entryId, stored),
                bytes.length);
    }

    public byte[] read(Long memberId, Long entryId, String fileName) {
        Path folder = folderOf(memberId, entryId, false);
        if (folder == null || !localFileStore.exists(folder, fileName)) {
            throw new InvalidInputException("스크린샷이 없습니다: " + fileName);
        }
        return localFileStore.read(folder, fileName);
    }

    /** 여러 장 한 번에. 화면이 체크박스로 고른 것을 통째로 넘긴다 */
    @Transactional
    public int delete(Long memberId, Long entryId, List<String> fileNames) {
        Path folder = folderOf(memberId, entryId, false);
        if (folder == null) {
            return 0;
        }
        fileNames.forEach(name -> localFileStore.delete(folder, name));
        return fileNames.size();
    }

    /** 탐색기로 열 경로. 일렉트론이 받아서 `shell.openPath`에 넘긴다 */
    public String folderPath(Long memberId, Long entryId) {
        Path folder = folderOf(memberId, entryId, true);
        return folder.toAbsolutePath().toString();
    }

    /**
     * @param create 없으면 만들지 여부. 목록·읽기는 만들지 않는다 —
     *               스크린샷을 한 번도 안 넣은 게임까지 빈 폴더가 생기면 media/가 금방 지저분해진다
     */
    private Path folderOf(Long memberId, Long entryId, boolean create) {
        BacklogEntry entry = entryFinder.findOwnedWithGame(memberId, entryId);
        Game game = entry.getGame();

        String slug = game.getMediaFolder();
        if (slug == null) {
            if (!create) {
                return null;
            }
            // 첫 저장 때 정한다. 이름이 나중에 바뀌어도 폴더는 그대로 간다
            slug = game.assignMediaFolder(uniqueSlug(game));
        }
        return mediaPaths.mediaFolder(slug);
    }

    /**
     * 겹치면 게임 번호를 붙인다.
     *
     * ⚠️ **이름이 같은 게임이 실제로 둘 있을 수 있다** — IGDB에서 가져온 `Hollow Knight`와
     * 검색이 안 돼서 직접 등록한 `Hollow Knight`. 그냥 slug만 쓰면 **두 게임의 스크린샷이
     * 한 폴더에 섞이고**, 한쪽을 지우면 다른 쪽 사진까지 사라진다.
     *
     * 번호를 뒤에 붙이는 건 폴더 이름을 조금 못생기게 만들지만, **겹친 쪽만** 그렇다 —
     * 처음 차지한 게임은 깨끗한 이름을 그대로 쓴다
     */
    private String uniqueSlug(Game game) {
        String base = Slugs.of(game.getName());
        boolean taken = gameRepository.findByMediaFolder(base)
                .filter(other -> !other.getId().equals(game.getId()))
                .isPresent();

        return taken ? base + "-" + game.getId() : base;
    }

    /**
     * `001.png`, `002.jpg` …
     *
     * 폴더에 이미 있는 이름과 부딪히지 않게 **가장 큰 번호 다음**을 쓴다.
     * 개수를 세서 +1 하면 중간을 지웠을 때 이미 있는 번호를 다시 골라 덮어쓴다
     */
    private String nextName(Path folder, String extension) {
        int max = localFileStore.list(folder).stream()
                .map(name -> name.replaceFirst("\\..*$", ""))
                .filter(base -> base.matches("\\d+"))
                .mapToInt(Integer::parseInt)
                .max()
                .orElse(0);

        return "%03d.%s".formatted(max + 1, extension);
    }

    /**
     * 확장자 → MIME 타입.
     *
     * 저장할 때 **확장자와 매직 넘버를 대조**했으므로 여기서는 확장자를 믿어도 된다.
     * 안 주면 `application/octet-stream`으로 나가서 새 탭에서 열면 다운로드가 된다
     */
    public static String contentTypeOf(String fileName) {
        String ext = fileName.substring(fileName.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
        return switch (ext) {
            case "png" -> "image/png";
            case "jpg", "jpeg" -> "image/jpeg";
            case "webp" -> "image/webp";
            default -> "application/octet-stream";
        };
    }

    private String extensionOf(String fileName) {
        return fileName.substring(fileName.lastIndexOf('.') + 1)
                .strip().toLowerCase(Locale.ROOT);
    }

    private long sizeOf(Path file) {
        try {
            return Files.size(file);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}

package com.milobeene.starlog.backlog.service;

import com.milobeene.starlog.backlog.domain.BacklogEntry;
import com.milobeene.starlog.backlog.dto.ScreenshotResponse;
import java.nio.file.attribute.FileTime;
import com.milobeene.starlog.common.exception.InvalidInputException;
import com.milobeene.starlog.common.storage.LocalFileStore;
import com.milobeene.starlog.common.storage.MediaPaths;
import com.milobeene.starlog.common.storage.StorageProperties;
import com.milobeene.starlog.common.util.Slugs;
import com.milobeene.starlog.game.domain.Game;
import com.milobeene.starlog.game.repository.GameRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.util.UriUtils;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
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
@Slf4j
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ScreenshotService {

    private final BacklogEntryFinder entryFinder;
    private final MediaFileValidator validator;
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
                .map(name -> describe(entryId, folder, name))
                .toList();
    }

    private ScreenshotResponse describe(Long entryId, Path folder, String name) {
        Path file = folder.resolve(name);
        return new ScreenshotResponse(
                name,
                /*
                 * ⚠️ **이름을 URL에 그대로 붙이면 안 된다.** 우리가 만든 이름은 `001.png`라
                 * 안전하지만, **사람이 탐색기로 직접 넣는 게 설계된 사용법**이다(§10-1).
                 * `내 스샷 #1.png`가 들어오면 `#`부터가 조각(fragment)으로 잘려나가
                 * 서버까지 오지도 못한다 — 화면에는 깨진 그림만 뜬다
                 */
                "/api/backlog/%d/screenshots/%s".formatted(
                        entryId, UriUtils.encodePathSegment(name, StandardCharsets.UTF_8)),
                sizeOf(file),
                MediaFileValidator.contentTypeOf(name),
                takenAt(file));
    }

    /**
     * 저장.
     *
     * **파일 이름을 순번으로 붙인다** — 커버(uuid)와 다른 유일한 자리다.
     * 사람이 폴더를 직접 열어볼 물건이라 `a3f9c1....png`가 늘어서 있으면 못 쓴다.
     * 충돌은 이미 있는 번호 다음을 골라 피한다
     */
    /**
     * @param takenAtMillis 원본이 만들어진 시각. **브라우저가 파일의 `lastModified`를 준다.**
     *                      이걸 파일에 심어야 "찍은 순서"로 정렬할 수 있다 — 여러 장을 한 번에
     *                      끌어다 놓으면 도착 순서가 뒤죽박죽이라 번호만으로는 순서가 안 맞는다
     */
    @Transactional
    public ScreenshotResponse save(Long memberId, Long entryId, String fileName,
                                   byte[] bytes, Long takenAtMillis) {
        String contentType = validator.resolveContentType(fileName, bytes.length,
                storageProperties.maxScreenshotBytes(), storageProperties.maxVideoBytes());
        // 확장자만 믿지 않는다 — 매직 넘버로 실제 형식을 확인한다 (K-3과 같은 검사)
        validator.validateMagic(bytes, contentType);

        Path folder = folderOf(memberId, entryId, true);
        String stored = nextName(folder, extensionOf(fileName));

        localFileStore.saveAs(folder, stored, bytes);

        /*
         * 원본 시각을 파일에 심는다. 안 심으면 "이 폴더에 넣은 순간"이 시각이 되어
         * **1년 전 스크린샷 스무 장을 한꺼번에 넣으면 전부 같은 시각**이 된다
         */
        Path file = folder.resolve(stored);
        if (takenAtMillis != null && takenAtMillis > 0) {
            try {
                Files.setLastModifiedTime(file, FileTime.fromMillis(takenAtMillis));
            } catch (IOException e) {
                // 못 심어도 파일은 멀쩡하다. 정렬만 도착 순서가 된다
                log.warn("원본 시각을 심지 못했습니다. {}", stored, e);
            }
        }
        return describe(entryId, folder, stored);
    }

    /**
     * 원본 파일의 경로. **바이트가 아니라 경로를 준다** (2026-08-28).
     *
     * 예전엔 `byte[]`로 통째로 읽어 돌려줬는데, 영상 상한이 200MB라 그게 힘에 부친다 —
     * 읽은 배열 한 벌에 응답 버퍼 한 벌이라 **한 번 재생에 힙을 수백 MB** 잡는다.
     *
     * 더 큰 문제는 **탐색(seek)이 안 된다**는 것이다. `byte[]`로 내보내면 Range 요청을
     * 처리할 방법이 없어서 브라우저가 영상 중간으로 못 건너뛴다. 컨트롤러가 `Resource`로
     * 내보내면 스프링이 Range를 알아서 처리한다 — 재생 막대를 끌 수 있게 된다
     */
    public Path resolve(Long memberId, Long entryId, String fileName) {
        Path folder = folderOf(memberId, entryId, false);
        if (folder == null || !localFileStore.exists(folder, fileName)) {
            throw new InvalidInputException("스크린샷이 없습니다: " + fileName);
        }
        return localFileStore.resolve(folder, fileName);
    }

    /**
     * 여러 장 한 번에. 화면이 체크박스로 고른 것을 통째로 넘긴다.
     *
     * ⚠️ **실제로 지운 개수를 센다.** 예전엔 요청 개수를 그대로 돌려줬는데, 삭제가 실패를
     * 삼키는 구조라 **한 장도 못 지우고도 "3장 삭제"라고 답할 수 있었다.**
     * 폴더는 사람이 직접 건드리는 곳이라(§10-1) 목록과 실제가 어긋나는 게 예외가 아니다
     */
    @Transactional
    public int delete(Long memberId, Long entryId, List<String> fileNames) {
        Path folder = folderOf(memberId, entryId, false);
        if (folder == null) {
            return 0;
        }
        return (int) fileNames.stream()
                .filter(name -> localFileStore.delete(folder, name))
                .count();
    }

    /**
     * 탐색기로 열 경로. 일렉트론이 받아서 `shell.openPath`에 넘긴다.
     *
     * **여기서 폴더를 만든다** (사용자 결정 2026-08-28). 아직 한 장도 안 넣은 게임은 폴더가
     * 없어서 탐색기가 "없는 경로"라고 하는데, **열어보려는 이유가 대개 직접 넣으려는 것**이다.
     * 목록·읽기는 여전히 안 만든다 — 그건 만들 이유가 없다
     */
    @Transactional
    public String folderPath(Long memberId, Long entryId) {
        Path folder = folderOf(memberId, entryId, true);
        try {
            Files.createDirectories(folder);
        } catch (IOException e) {
            throw new UncheckedIOException("폴더를 만들지 못했습니다: " + folder, e);
        }
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
        if (slug != null) {
            return mediaPaths.mediaFolder(slug);
        }

        /*
         * ## 🔴 칸이 비었다고 폴더가 없는 건 아니다 (2026-08-28)
         *
         * 예전엔 여기서 바로 null을 돌려줬다 — 그래서 `media/slay-the-spire/`에 파일이
         * 멀쩡히 있는데 **화면에는 "여기에 끌어다 놓으세요"만** 떴다. 한 장을 올리는 순간
         * 폴더 이름이 정해지면서 **있던 파일까지 한꺼번에 나타났다.**
         *
         * 칸이 빌 수 있는 길이 여럿이다 — 클라우드에서 뽑은 세이브파일(내보내기가 이 칸을
         * 담기 전에 만들어진 것), 백업에서 되돌린 것, 사람이 폴더를 먼저 만든 경우.
         * 실제로 게임 77개 중 이 칸이 채워진 건 1개뿐이었다.
         *
         * **그래서 이름으로 한 번 찾아본다.** 폴더가 이미 있으면 그게 이 게임 것이다 —
         * `uniqueSlug`가 남이 차지한 이름은 피해 가므로 남의 폴더를 뺏지 않는다
         */
        String candidate = uniqueSlug(game);
        Path folder = mediaPaths.mediaFolder(candidate);
        if (Files.isDirectory(folder)) {
            /*
             * 칸에도 적어둔다. 다만 **목록 조회는 `readOnly = true`라 이 변경이 저장되지
             * 않는다** — 스프링이 세션을 읽기 전용으로 두어 변경 감지가 안 돈다.
             * 그래도 적는 이유는 `save`·`folderPath`처럼 쓰기로 들어온 경우에는 저장되고,
             * 저장이 안 되는 쪽도 손해가 없기 때문이다(다음에 다시 찾으면 그만이고,
             * `isDirectory` 한 번은 DB 조회보다 싸다)
             */
            game.assignMediaFolder(candidate);
            return folder;
        }

        if (!create) {
            return null;
        }
        // 첫 저장 때 정한다. 이름이 나중에 바뀌어도 폴더는 그대로 간다
        return mediaPaths.mediaFolder(game.assignMediaFolder(candidate));
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

    /** 파일 수정시각 = 원본을 찍은 시각. 저장할 때 심어둔 값이다 */
    private String takenAt(Path file) {
        try {
            return Files.getLastModifiedTime(file).toInstant().toString();
        } catch (IOException e) {
            return null;
        }
    }
}

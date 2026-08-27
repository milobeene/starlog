package com.milobeene.starlog.common.storage;

import com.milobeene.starlog.common.exception.InvalidInputException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;

/**
 * 데이터 루트 안의 파일을 직접 다룬다 (v1.0 6·7단계).
 *
 * `FileStoragePort`를 구현하지 **않는다.** 그 포트는 프리사인드 URL 발급처럼
 * **오브젝트 스토리지에만 있는 개념**을 담고 있어서, 로컬 폴더가 그걸 흉내 내면
 * "URL을 주는 척하다가 실은 백엔드를 거치는" 이상한 구현이 된다.
 * 업로드 경로가 애초에 갈리므로(architecture §4 ⚠️) 인터페이스를 억지로 맞출 이유가 없다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class LocalFileStore {

    /**
     * 파일 하나 저장. 이름은 우리가 정한다.
     *
     * **원본 파일명을 안 쓴다.** 사용자 입력이 그대로 파일명이 되면 경로 탈출·중복·
     * OS별 금지문자를 전부 감당해야 한다. uuid면 그 부류가 통째로 사라지고,
     * 사람이 폴더를 열어볼 일이 있는 스크린샷만 예외로 순번을 붙인다
     */
    public String save(Path directory, byte[] bytes, String extension) {
        String name = UUID.randomUUID() + "." + extension;
        write(directory.resolve(name), bytes);
        return name;
    }

    /** 이름을 지정해 저장 (스크린샷). 이미 있으면 덮어쓴다 */
    public void saveAs(Path directory, String fileName, byte[] bytes) {
        write(directory.resolve(fileName), bytes);
    }

    public byte[] read(Path directory, String fileName) {
        Path file = safeResolve(directory, fileName);
        try {
            return Files.readAllBytes(file);
        } catch (IOException e) {
            throw new UncheckedIOException("파일을 읽지 못했습니다: " + fileName, e);
        }
    }

    public boolean exists(Path directory, String fileName) {
        return Files.isRegularFile(safeResolve(directory, fileName));
    }

    /**
     * 검증을 마친 경로. **바이트로 읽지 않고 경로만 필요한 쪽**이 쓴다 (영상 스트리밍).
     *
     * `read`를 안 쓰고 이걸 쓰면 파일이 힙에 안 올라오고, 컨트롤러가 `Resource`로 내보내
     * 스프링이 Range 요청까지 처리한다. 200MB 영상을 `byte[]`로 다루던 것을 대신한다
     */
    public Path resolve(Path directory, String fileName) {
        return safeResolve(directory, fileName);
    }

    /** 실패해도 예외를 던지지 않는다 — 이미 없는 파일을 지우는 것도 성공이다 */
    public void delete(Path directory, String fileName) {
        try {
            Files.deleteIfExists(safeResolve(directory, fileName));
        } catch (IOException | InvalidInputException e) {
            log.warn("파일 삭제 실패 — 무시한다. {}", fileName, e);
        }
    }

    /** 폴더 안의 파일 이름들. 폴더가 없으면 빈 목록 */
    public List<String> list(Path directory) {
        if (!Files.isDirectory(directory)) {
            return List.of();
        }
        try (Stream<Path> files = Files.list(directory)) {
            return files.filter(Files::isRegularFile)
                    .map(p -> p.getFileName().toString())
                    .sorted()
                    .toList();
        } catch (IOException e) {
            throw new UncheckedIOException("폴더를 읽지 못했습니다: " + directory, e);
        }
    }

    private void write(Path target, byte[] bytes) {
        try {
            Files.createDirectories(target.getParent());
            /*
             * 임시 파일에 쓰고 이름을 바꾼다. 그냥 쓰면 쓰는 도중에 앱이 죽었을 때
             * **반쯤 쓰인 이미지**가 남고, 그건 화면에서 깨진 그림으로 보인다.
             * rename은 같은 볼륨 안에서 원자적이라 "없거나 온전하거나" 둘 중 하나다
             */
            Path tmp = target.resolveSibling(target.getFileName() + ".tmp");
            Files.write(tmp, bytes);
            Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            throw new UncheckedIOException("파일을 저장하지 못했습니다: " + target, e);
        }
    }

    /**
     * ⚠️ **파일명은 클라이언트에서 오기도 한다** (스크린샷 삭제). `../../etc/passwd`가
     * 오면 데이터 루트 밖을 지운다. 조립한 경로가 정말 그 폴더 안인지 확인한다
     */
    private Path safeResolve(Path directory, String fileName) {
        Path file = directory.resolve(fileName).normalize();
        if (!file.startsWith(directory)) {
            throw new InvalidInputException("잘못된 파일 이름입니다: " + fileName);
        }
        return file;
    }
}

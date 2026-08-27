package com.milobeene.starlog.backlog.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.milobeene.starlog.backlog.service.BacklogService;
import com.milobeene.starlog.game.domain.Game;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.support.ControllerTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.TestPropertySource;

/**
 * 로컬 저장 경로 (v1.0 6·7단계).
 *
 * ## 왜 별도 클래스인가
 *
 * 저장 위치는 **부팅 때 정해지는 설정**이라 한 컨텍스트 안에서 두 경로를 다 볼 수 없다.
 * `CoverImageTest`가 스토리지 경로(프리사인드 3단계)를 지키고, 여기가 로컬 경로를 지킨다.
 * 컨텍스트가 하나 더 뜨는 값은 치른다 — **경로가 둘로 갈렸는데 한쪽만 테스트하면
 * 그 한쪽만 살아 있게 된다.**
 *
 * ## 데이터 루트를 임시 폴더로 돌린다
 *
 * 안 그러면 테스트가 실제 데이터 폴더에 파일을 쓴다. `MediaPaths`가 이 값을 읽는
 * 유일한 지점이라 여기만 덮으면 된다
 */
@TestPropertySource(properties = {
        "starlog.media.use-storage-for-covers=false",
        "starlog.media.use-storage-for-screenshots=false",
        "starlog.data-root=${java.io.tmpdir}/starlog-test-media",
})
class LocalMediaTest extends ControllerTestSupport {

    @Autowired BacklogService backlogService;
    @Autowired com.milobeene.starlog.common.storage.MediaPaths mediaPaths;

    /**
     * ⚠️ **파일은 트랜잭션 롤백을 안 탄다.**
     *
     * DB는 테스트마다 되돌아가지만 디스크에 쓴 파일은 그대로 남는다. 그래서 앞 테스트가
     * 만든 `001.png`가 다음 테스트에서 `002.png`부터 시작하게 만들고, 실행할 때마다
     * 결과가 달라진다 — 실제로 그렇게 깨졌다. **폴더를 직접 비워야 한다**
     */
    @org.junit.jupiter.api.BeforeEach
    void clearMedia() throws java.io.IOException {
        for (java.nio.file.Path dir : java.util.List.of(mediaPaths.media(), mediaPaths.covers())) {
            if (!java.nio.file.Files.isDirectory(dir)) {
                continue;
            }
            try (var walk = java.nio.file.Files.walk(dir)) {
                walk.sorted(java.util.Comparator.reverseOrder())
                        .filter(path -> !path.equals(dir))
                        .forEach(path -> {
                            try {
                                java.nio.file.Files.delete(path);
                            } catch (java.io.IOException ignored) {
                                // 못 지워도 다음 테스트가 다시 시도한다
                            }
                        });
            }
        }
    }

    private static final byte[] PNG = {
            (byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D};

    @Test
    public void 스토리지를_안_쓰면_허가증_대신_LOCAL이_온다() throws Exception {
        //given
        Member member = saveMember();
        Long entryId = entry(member);

        /*
         * when //then — 화면은 "어디에 어떻게 올리죠?"만 묻는다.
         * 판정에 필요한 것(자격증명·체크박스)이 전부 서버에 있어서 화면이 정할 수가 없다
         */
        mockMvc.perform(post("/api/backlog/{id}/cover/upload-url", entryId)
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fileName\":\"cover.png\",\"sizeBytes\":12}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mode").value("LOCAL"))
                .andExpect(jsonPath("$.uploadUrl").doesNotExist());
    }

    @Test
    public void 로컬_커버는_올린_뒤_바로_읽힌다() throws Exception {
        //given
        Member member = saveMember();
        Long entryId = entry(member);

        //when — 왕복이 하나다. 바이트가 백엔드를 지나간다
        mockMvc.perform(multipart("/api/backlog/{id}/cover/file", entryId)
                        .file(new MockMultipartFile("file", "cover.png", "image/png", PNG))
                        .header("X-Member-Id", member.getId()))
                .andExpect(status().isOk());

        //then — 같은 바이트가 되돌아온다
        byte[] served = mockMvc.perform(get("/api/backlog/{id}/cover/file", entryId)
                        .header("X-Member-Id", member.getId()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();
        assertThat(served).isEqualTo(PNG);
    }

    @Test
    public void 로컬_커버_주소에는_캐시를_깨는_값이_붙는다() throws Exception {
        /*
         * given — 교체해도 주소가 같아서 **브라우저가 옛 그림을 계속 보여준다.**
         * 저장된 파일명을 쿼리로 달아 그 문제를 없앤다
         */
        Member member = saveMember();
        Long entryId = entry(member);
        uploadCover(member, entryId);

        //when //then
        mockMvc.perform(get("/api/backlog/{id}", entryId).header("X-Member-Id", member.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.resolved.cover.url")
                        .value(org.hamcrest.Matchers.containsString("/cover/file?v=")));
    }

    @Test
    public void 스토리지_커버가_섞여_있어도_목록이_살아있다() throws Exception {
        /*
         * given — 클라우드에서 뽑은 세이브파일이 정확히 이 상태다. 커버는 버킷에 있는데
         * 로컬에는 자격증명이 없어 **주소를 만들 수가 없다**.
         *
         * `Collectors.toMap`은 값이 null이면 NPE라, 예전 구현은 **커버 한 장 때문에
         * 목록 전체가 500**이었다. 사이드바 이름은 다른 API라 살아남고 상세는 null을 견뎌서
         * "썸네일만 안 나온다"처럼 보였다
         */
        Member member = saveMember();
        Long entryId = entry(member);
        em.createQuery("""
                        update CoverImage c
                           set c.location = com.milobeene.starlog.backlog.domain.CoverLocation.EXTERNAL,
                               c.storageKey = 'covers/1/1/gone.png'
                         where c.backlogEntry.id = :id
                        """)
                .setParameter("id", entryId)
                .executeUpdate();
        uploadCover(member, entryId);   // 먼저 만들어 두고 위에서 EXTERNAL로 바꾼다
        em.flush();
        em.clear();

        //when //then — 주소를 못 만드는 커버는 빼고 나머지를 그린다
        mockMvc.perform(get("/api/backlog").header("X-Member-Id", member.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    public void 스크린샷은_폴더에_쌓이고_번호가_이어진다() throws Exception {
        //given — DB에 행이 없다. 폴더를 읽는 게 곧 목록이다
        Member member = saveMember();
        Long entryId = entry(member);

        //when
        for (int i = 0; i < 2; i++) {
            mockMvc.perform(multipart("/api/backlog/{id}/screenshots", entryId)
                            .file(new MockMultipartFile("file", "shot.png", "image/png", PNG))
                            .header("X-Member-Id", member.getId()))
                    .andExpect(status().isOk());
        }

        //then — 이름이 001, 002로 이어진다. 사람이 탐색기로 열어볼 폴더라 uuid가 아니다
        mockMvc.perform(get("/api/backlog/{id}/screenshots", entryId)
                        .header("X-Member-Id", member.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].fileName").value("001.png"))
                .andExpect(jsonPath("$[1].fileName").value("002.png"));
    }

    @Test
    public void 스크린샷_폴더는_게임_이름의_slug다() throws Exception {
        //given
        Member member = saveMember();
        Long entryId = entry(member, "Ratchet & Clank: Rift Apart");

        //when
        mockMvc.perform(multipart("/api/backlog/{id}/screenshots", entryId)
                        .file(new MockMultipartFile("file", "shot.png", "image/png", PNG))
                        .header("X-Member-Id", member.getId()))
                .andExpect(status().isOk());

        //then — 숫자 폴더가 아니라 읽히는 이름이어야 탐색기에서 쓸모가 있다
        mockMvc.perform(get("/api/backlog/{id}/screenshots/folder", entryId)
                        .header("X-Member-Id", member.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.path")
                        .value(org.hamcrest.Matchers.endsWith("ratchet-clank-rift-apart")));
    }

    @Test
    public void 스크린샷을_고른_만큼_지운다() throws Exception {
        //given
        Member member = saveMember();
        Long entryId = entry(member);
        mockMvc.perform(multipart("/api/backlog/{id}/screenshots", entryId)
                        .file(new MockMultipartFile("file", "shot.png", "image/png", PNG))
                        .header("X-Member-Id", member.getId()))
                .andExpect(status().isOk());

        //when — DELETE에 본문을 싣는 건 규격상 회색지대라 POST로 받는다
        mockMvc.perform(post("/api/backlog/{id}/screenshots/delete", entryId)
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[\"001.png\"]"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.deleted").value(1));

        //then
        mockMvc.perform(get("/api/backlog/{id}/screenshots", entryId)
                        .header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.length()").value(0));
    }

    /**
     * 리뷰 2026-08-28. **영상 재생 탐색이 되려면 Range를 받아야 한다.**
     *
     * 예전엔 `byte[]`로 내보냈다 — Range를 처리할 방법이 아예 없어서 재생 막대를
     * 끌 수가 없었고, 200MB 영상이 힙에 두 벌 올라갔다. `Resource`로 바꾼 것을 못 박는다
     */
    @Test
    public void 스크린샷은_구간_요청을_받는다() throws Exception {
        //given
        Member member = saveMember();
        Long entryId = entry(member);
        mockMvc.perform(multipart("/api/backlog/{id}/screenshots", entryId)
                        .file(new MockMultipartFile("file", "shot.png", "image/png", PNG))
                        .header("X-Member-Id", member.getId()))
                .andExpect(status().isOk());

        //when — 앞 4바이트만 달라고 한다
        mockMvc.perform(get("/api/backlog/{id}/screenshots/001.png", entryId)
                        .header("X-Member-Id", member.getId())
                        .header("Range", "bytes=0-3"))
                //then — 206이 와야 브라우저가 탐색을 시도한다. 200이면 통째로 받는다
                .andExpect(status().isPartialContent())
                .andExpect(header().string("Content-Range", "bytes 0-3/" + PNG.length));

        // Range 없이 부르면 여전히 전체다 — Accept-Ranges가 있어야 브라우저가 물어본다
        mockMvc.perform(get("/api/backlog/{id}/screenshots/001.png", entryId)
                        .header("X-Member-Id", member.getId()))
                .andExpect(status().isOk())
                .andExpect(header().string("Accept-Ranges", "bytes"));
    }

    /**
     * 리뷰 2026-08-28. 삭제는 실패를 삼키므로 **요청 개수를 그대로 돌려주면 거짓말**이 된다.
     * 폴더는 사람이 직접 건드리는 곳이라 "목록엔 있는데 파일은 없다"가 예외가 아니다
     */
    @Test
    public void 없는_스크린샷을_지우면_개수에_안_센다() throws Exception {
        //given
        Member member = saveMember();
        Long entryId = entry(member);
        mockMvc.perform(multipart("/api/backlog/{id}/screenshots", entryId)
                        .file(new MockMultipartFile("file", "shot.png", "image/png", PNG))
                        .header("X-Member-Id", member.getId()))
                .andExpect(status().isOk());

        //when — 있는 것 하나 + 없는 것 둘
        mockMvc.perform(post("/api/backlog/{id}/screenshots/delete", entryId)
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[\"001.png\",\"404.png\",\"405.png\"]"))
                //then — 3이 아니라 1이다
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.deleted").value(1));
    }

    private Long entry(Member member) {
        return entry(member, "Hollow Knight");
    }

    private Long entry(Member member, String gameName) {
        Game game = saveGame(gameName);
        return backlogService.addToBacklog(member.getId(), game.getId());
    }

    private void uploadCover(Member member, Long entryId) throws Exception {
        mockMvc.perform(multipart("/api/backlog/{id}/cover/file", entryId)
                        .file(new MockMultipartFile("file", "cover.png", "image/png", PNG))
                        .header("X-Member-Id", member.getId()))
                .andExpect(status().isOk());
    }
}

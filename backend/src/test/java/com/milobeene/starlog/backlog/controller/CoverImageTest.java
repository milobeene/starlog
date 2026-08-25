package com.milobeene.starlog.backlog.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.milobeene.starlog.backlog.repository.CoverImageRepository;
import com.milobeene.starlog.game.domain.Game;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.support.ControllerTestSupport;
import com.milobeene.starlog.support.FakeFileStorage;
import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

/** 커버 업로드·교체·삭제·폴백 (Phase 5, K-2~K-5) */
class CoverImageTest extends ControllerTestSupport {

    @Autowired CoverImageRepository coverImageRepository;

    @Test
    public void 업로드_허가증은_항목_소유_경로로_발급된다() throws Exception {
        //given
        Member member = saveMember();
        Long entryId = addEntry(member, saveGame("Celeste"));

        //when //then — 경로에 memberId·entryId가 박혀야 확정 단계에서 소유권을 검증할 수 있다
        mockMvc.perform(post("/api/backlog/{id}/cover/upload-url", entryId)
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fileName\":\"cover.jpg\",\"sizeBytes\":102400}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.contentType").value("image/jpeg"))
                .andExpect(jsonPath("$.storageKey")
                        .value(org.hamcrest.Matchers.startsWith(
                                "covers/" + member.getId() + "/" + entryId + "/")))
                .andExpect(jsonPath("$.uploadUrl").exists());
    }

    @Test
    public void 지원하지_않는_확장자는_400이다() throws Exception {
        //given
        Member member = saveMember();
        Long entryId = addEntry(member, saveGame("Celeste"));

        //when //then — 매직 넘버를 아는 형식만 허용한다. 못 검사하는 형식을 열면 위장 파일을 못 막는다
        mockMvc.perform(post("/api/backlog/{id}/cover/upload-url", entryId)
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fileName\":\"cover.gif\",\"sizeBytes\":1024}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    public void 용량_상한을_넘으면_발급조차_안_된다() throws Exception {
        //given — 기본 상한 5MB
        Member member = saveMember();
        Long entryId = addEntry(member, saveGame("Celeste"));

        //when //then
        mockMvc.perform(post("/api/backlog/{id}/cover/upload-url", entryId)
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fileName\":\"cover.jpg\",\"sizeBytes\":10485760}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    public void 확정하면_커버가_붙고_상세에_URL이_나온다() throws Exception {
        //given
        Member member = saveMember();
        Long entryId = addEntry(member, saveGame("Celeste"));
        String key = issueAndUpload(member, entryId, "cover.jpg", FakeFileStorage.JPEG, "image/jpeg");

        //when
        mockMvc.perform(put("/api/backlog/{id}/cover", entryId)
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"storageKey\":\"" + key + "\"}"))
                .andExpect(status().isOk());

        //then
        em.flush();
        mockMvc.perform(get("/api/backlog/{id}", entryId).header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.resolved.cover.source").value("PERSONAL"))
                .andExpect(jsonPath("$.resolved.cover.url").value("https://cdn.test/" + key));
    }

    @Test
    public void 이미지로_위장한_파일은_확정에서_걸린다() throws Exception {
        //given — 확장자는 jpg인데 내용이 HTML. 발급·서명은 통과한다
        Member member = saveMember();
        Long entryId = addEntry(member, saveGame("Celeste"));
        String key = issueAndUpload(member, entryId, "evil.jpg", FakeFileStorage.HTML, "image/jpeg");

        //when //then — 앞 12바이트를 실제로 읽어야만 잡히는 종류다 (K-3)
        mockMvc.perform(put("/api/backlog/{id}/cover", entryId)
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"storageKey\":\"" + key + "\"}"))
                .andExpect(status().isBadRequest());

        assertThat(coverImageRepository.findByBacklogEntryId(entryId)).isEmpty();
    }

    @Test
    public void 업로드가_실제로_안_됐으면_확정이_400이다() throws Exception {
        //given — 허가증만 받고 PUT은 안 한 상태. 서버는 클라이언트의 "올렸어요"를 믿지 않는다
        Member member = saveMember();
        Long entryId = addEntry(member, saveGame("Celeste"));
        String key = issueUploadUrl(member, entryId, "cover.jpg");

        //when //then
        mockMvc.perform(put("/api/backlog/{id}/cover", entryId)
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"storageKey\":\"" + key + "\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    public void 남의_경로_key로는_확정할_수_없다() throws Exception {
        //given — 다른 회원이 올린 파일을 내 항목 커버로 붙이려는 시도
        Member other = saveMember();
        Long otherEntry = addEntry(other, saveGame("Hades"));
        String otherKey = issueAndUpload(other, otherEntry, "cover.jpg",
                FakeFileStorage.JPEG, "image/jpeg");

        Member me = saveMember();
        Long myEntry = addEntry(me, saveGame("Celeste"));

        //when //then — 경로 prefix 검사로 막힌다
        mockMvc.perform(put("/api/backlog/{id}/cover", myEntry)
                        .header("X-Member-Id", me.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"storageKey\":\"" + otherKey + "\"}"))
                .andExpect(status().isBadRequest());

        assertThat(coverImageRepository.findByBacklogEntryId(myEntry)).isEmpty();
    }

    @Test
    public void 교체하면_예전_파일이_스토리지에서_지워진다() throws Exception {
        //given — FR-MED-03
        Member member = saveMember();
        Long entryId = addEntry(member, saveGame("Celeste"));
        String firstKey = attachCover(member, entryId, "first.jpg", FakeFileStorage.JPEG, "image/jpeg");

        //when
        String secondKey = attachCover(member, entryId, "second.png", FakeFileStorage.PNG, "image/png");

        //then
        assertThat(storage.deleted).containsExactly(firstKey);
        assertThat(storage.exists(secondKey)).isTrue();
        em.flush();
        em.clear();
        assertThat(coverImageRepository.findByBacklogEntryId(entryId).orElseThrow().getStorageKey())
                .isEqualTo(secondKey);
    }

    @Test
    public void 삭제하면_레코드와_파일이_같이_사라진다() throws Exception {
        //given
        Member member = saveMember();
        Long entryId = addEntry(member, saveGame("Celeste"));
        String key = attachCover(member, entryId, "cover.jpg", FakeFileStorage.JPEG, "image/jpeg");

        //when
        mockMvc.perform(delete("/api/backlog/{id}/cover", entryId)
                        .header("X-Member-Id", member.getId()))
                .andExpect(status().isNoContent());

        //then
        em.flush();
        em.clear();
        assertThat(coverImageRepository.findByBacklogEntryId(entryId)).isEmpty();
        assertThat(storage.deleted).contains(key);
    }

    @Test
    public void 상세에서도_커버가_resolved_안에서_폴백된다() throws Exception {
        //given — v1.7. 장르는 서버가 합성하는데 커버만 밖에 있던 비대칭을 없앴다
        Member member = saveMember();
        Game game = Game.fromCatalog("Hollow Knight", "14593", LocalDateTime.now());
        game.syncFromCatalog(new com.milobeene.starlog.game.domain.CatalogSyncCommand(
                java.util.List.of(), java.util.List.of(), java.util.List.of(), null,
                "cobfzp", null, null, null, null, null, java.util.List.of(),
                null, null, null, null), LocalDateTime.now());
        gameRepository.persist(game);
        em.flush();
        Long entryId = addEntry(member, game);

        //when //then — 개인 커버가 없으니 MASTER가 이긴다. URL이 아니라 id를 준다
        mockMvc.perform(get("/api/backlog/{id}", entryId).header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.resolved.cover.source").value("MASTER"))
                .andExpect(jsonPath("$.resolved.cover.imageId").value("cobfzp"))
                .andExpect(jsonPath("$.resolved.cover.url").doesNotExist());
    }

    @Test
    public void 커버가_아무것도_없으면_NONE이다() throws Exception {
        //given
        Member member = saveMember();
        Long entryId = addEntry(member, saveGame("Celeste"));

        //when //then — 화면이 기본 이미지를 그릴 근거가 된다 (FR-MED-02)
        mockMvc.perform(get("/api/backlog/{id}", entryId).header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.resolved.cover.source").value("NONE"));
    }

    @Test
    public void 상세에_담은_날짜가_실린다() throws Exception {
        //given — 타임라인의 기점 (§1.3)
        Member member = saveMember();
        Long entryId = addEntry(member, saveGame("Celeste"));

        //when //then
        mockMvc.perform(get("/api/backlog/{id}", entryId).header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.createdAt").exists());
    }

    @Test
    public void 커버가_없으면_마스터_커버_id가_폴백으로_나간다() throws Exception {
        //given — FR-MED-02. 서버는 합치지 않고 둘 다 내린다
        Member member = saveMember();
        Game game = Game.fromCatalog("Hollow Knight", "14593", LocalDateTime.now());
        game.syncFromCatalog(new com.milobeene.starlog.game.domain.CatalogSyncCommand(
                java.util.List.of(), java.util.List.of(), java.util.List.of(), null,
                "cobfzp", null, null, null, null, null, java.util.List.of(),
                null, null, null, null), LocalDateTime.now());
        gameRepository.persist(game);
        em.flush();
        Long entryId = addEntry(member, game);

        //when //then
        mockMvc.perform(get("/api/backlog").header("X-Member-Id", member.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].coverUrl").doesNotExist())
                .andExpect(jsonPath("$.items[0].coverImageId").value("cobfzp"));
    }

    @Test
    public void 개인_커버가_있으면_목록에도_URL이_실린다() throws Exception {
        //given
        Member member = saveMember();
        Long entryId = addEntry(member, saveGame("Celeste"));
        String key = attachCover(member, entryId, "cover.jpg", FakeFileStorage.JPEG, "image/jpeg");
        em.flush();

        //when //then
        mockMvc.perform(get("/api/backlog").header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.items[0].coverUrl").value("https://cdn.test/" + key));
    }

    @Test
    public void 남의_항목에는_허가증이_안_나온다() throws Exception {
        //given
        Member other = saveMember();
        Long otherEntry = addEntry(other, saveGame("Hades"));

        //when //then — 404다. 403을 주면 그 id가 존재한다는 게 새어나간다
        mockMvc.perform(post("/api/backlog/{id}/cover/upload-url", otherEntry)
                        .header("X-Member-Id", saveMember().getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fileName\":\"cover.jpg\",\"sizeBytes\":1024}"))
                .andExpect(status().isNotFound());
    }

    @Test
    public void 스토리지_장애_메시지가_게임_DB_장애와_구분된다() throws Exception {
        /*
         * given — 외부 의존이 둘(게임 DB·이미지 저장소)인데 전역 핸들러가 메시지를 하나로 뭉개면
         * 커버 업로드 실패에 "게임 정보 서비스" 안내가 나간다. 실제로 그렇게 나가던 것을
         * 앱을 띄워 확인하고 고쳤다 — 테스트만으로는 안 드러났다
         */
        Member member = saveMember();
        Long entryId = addEntry(member, saveGame("Celeste"));
        storage.willFail(new com.milobeene.starlog.common.exception.ExternalApiException(
                com.milobeene.starlog.common.exception.ExternalApiException.Service.FILE_STORAGE,
                "버킷 연결 실패"));

        //when //then
        mockMvc.perform(post("/api/backlog/{id}/cover/upload-url", entryId)
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fileName\":\"cover.jpg\",\"sizeBytes\":1024}"))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("이미지 저장소")));
    }

    // ── 헬퍼

    private Long addEntry(Member member, Game game) throws Exception {
        String body = mockMvc.perform(post("/api/backlog")
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"gameId\":" + game.getId() + "}"))
                .andReturn().getResponse().getContentAsString();
        em.flush();
        return Long.valueOf(body.replaceAll("\\D+", ""));
    }

    private String issueUploadUrl(Member member, Long entryId, String fileName) throws Exception {
        String body = mockMvc.perform(post("/api/backlog/{id}/cover/upload-url", entryId)
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fileName\":\"" + fileName + "\",\"sizeBytes\":12}"))
                .andReturn().getResponse().getContentAsString();

        return body.replaceAll(".*\"storageKey\"\\s*:\\s*\"([^\"]+)\".*", "$1");
    }

    /** 허가증 발급 + 브라우저가 스토리지로 PUT한 상태까지 */
    private String issueAndUpload(Member member, Long entryId, String fileName,
                                  byte[] content, String contentType) throws Exception {
        String key = issueUploadUrl(member, entryId, fileName);
        storage.putObject(key, content, contentType);
        return key;
    }

    /** 확정까지 */
    private String attachCover(Member member, Long entryId, String fileName,
                               byte[] content, String contentType) throws Exception {
        String key = issueAndUpload(member, entryId, fileName, content, contentType);
        mockMvc.perform(put("/api/backlog/{id}/cover", entryId)
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"storageKey\":\"" + key + "\"}"))
                .andExpect(status().isOk());
        return key;
    }
}

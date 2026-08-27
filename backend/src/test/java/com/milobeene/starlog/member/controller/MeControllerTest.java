package com.milobeene.starlog.member.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import static org.assertj.core.api.Assertions.assertThat;

import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.support.ControllerTestSupport;
import com.milobeene.starlog.platform.domain.Device;
import com.milobeene.starlog.platform.domain.Platform;
import com.milobeene.starlog.platform.service.PlatformAccountService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

/** 프로필·설정 (H-4). 화면 하나가 다섯 도메인을 걸치는 조합 지점이다 */
class MeControllerTest extends ControllerTestSupport {

    @Autowired PlatformAccountService platformAccountService;

    @Test
    public void me는_프로필과_계정과_기기와_구독을_한_번에_준다() throws Exception {
        //given
        Member member = saveMember();
        Platform steam = savePlatform(member, "Steam");
        platformAccountService.register(member.getId(), steam.getId(), "본계정");

        mockMvc.perform(post("/api/me/devices").header("X-Member-Id", member.getId())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"deviceType\":\"Nintendo Switch\",\"label\":\"거실용\"}"));
        mockMvc.perform(post("/api/me/subscriptions").header("X-Member-Id", member.getId())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"serviceName":"Xbox Game Pass","startedOn":"2026-01-01",
                         "fee":{"amount":11900,"currency":"KRW"},"billingCycle":"MONTHLY"}"""));

        //when //then
        mockMvc.perform(get("/api/me").header("X-Member-Id", member.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.profile.memberId").value(member.getId()))
                .andExpect(jsonPath("$.platformAccounts[0].platform.name").value("Steam"))
                .andExpect(jsonPath("$.platforms[0].name").value("Steam"))
                .andExpect(jsonPath("$.devices[0].label").value("거실용"))
                .andExpect(jsonPath("$.devices[0].deviceType").value("Nintendo Switch"))
                .andExpect(jsonPath("$.subscriptions[0].active").value(true))
                .andExpect(jsonPath("$.subscriptions[0].fee.currency").value("KRW"));
    }

    @Test
    public void 프로필을_수정하면_me에_반영된다() throws Exception {
        //given
        Member member = saveMember();

        //when
        mockMvc.perform(put("/api/me/profile").header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nickname\":\"밀로\",\"memo\":\"연습용\"}"))
                .andExpect(status().isOk());

        //then
        mockMvc.perform(get("/api/me").header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.profile.nickname").value("밀로"));
    }

    @Test
    public void options는_내_기기만_준다() throws Exception {
        //given — 마스터 공유를 폐기했다. 남의 기기가 섞이면 안 된다
        Member member = saveMember();
        Member other = saveMember();
        saveDevice(member, "Nintendo Switch");
        saveDevice(member, "Windows PC");
        saveDevice(other, "남의 PC");

        //when //then — 이름에 기종이 함께 붙는다
        mockMvc.perform(get("/api/me/options").header("X-Member-Id", member.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.devices.length()").value(2))
                .andExpect(jsonPath("$.devices[0].name").value("Nintendo Switch"));
    }

    @Test
    public void 삭제한_계정은_options에서_빠진다() throws Exception {
        //given
        Member member = saveMember();
        Platform steam = savePlatform(member, "Steam");
        Long accountId = platformAccountService.register(member.getId(), steam.getId(), "부계정");

        //when
        mockMvc.perform(delete("/api/me/platform-accounts/{id}", accountId)
                        .header("X-Member-Id", member.getId()))
                .andExpect(status().isNoContent());

        //then — 과거 기록에는 남지만 고를 수는 없다 (§6.5)
        mockMvc.perform(get("/api/me/options").header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.platformAccounts.length()").value(0));
    }

    @Test
    public void 삭제한_계정을_재등록하면_409에_되살리기_주소가_실린다() throws Exception {
        //given
        Member member = saveMember();
        Platform steam = savePlatform(member, "Steam");
        Long accountId = platformAccountService.register(member.getId(), steam.getId(), "본계정");
        platformAccountService.delete(member.getId(), accountId);

        //when //then — 백로그 항목과 같은 형태의 응답이다
        mockMvc.perform(post("/api/me/platform-accounts").header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"platformId\":" + steam.getId() + ",\"accountLabel\":\"본계정\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("REVIVABLE"))
                .andExpect(jsonPath("$.reviveUrl")
                        .value("/api/me/platform-accounts/" + accountId + "/revive"));
    }

    @Test
    public void 구독은_등록하고_지울_수_있다() throws Exception {
        //given
        Member member = saveMember();

        //when
        String body = mockMvc.perform(post("/api/me/subscriptions")
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"serviceName":"PS Plus","startedOn":"2026-02-01",
                                 "billingCycle":"YEARLY"}"""))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        Long id = Long.valueOf(body.replaceAll("\\D", ""));

        //then
        mockMvc.perform(delete("/api/me/subscriptions/{id}", id).header("X-Member-Id", member.getId()))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/me").header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.subscriptions.length()").value(0));
    }


    private Member reloadMember(Member member) {
        return em.find(Member.class, member.getId());
    }

    private Platform savePlatform(Member member, String name) {
        Platform platform = new Platform(em.getReference(Member.class, member.getId()), name);
        em.persist(platform);
        return platform;
    }

    private Device saveDevice(Member member, String label) {
        Device device = new Device(
                em.getReference(Member.class, member.getId()), label, label, null);
        em.persist(device);
        return device;
    }
}

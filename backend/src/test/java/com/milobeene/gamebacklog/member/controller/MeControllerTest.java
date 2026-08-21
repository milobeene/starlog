package com.milobeene.gamebacklog.member.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.milobeene.gamebacklog.member.domain.Member;
import com.milobeene.gamebacklog.support.ControllerTestSupport;
import com.milobeene.gamebacklog.platform.domain.Device;
import com.milobeene.gamebacklog.platform.domain.Platform;
import com.milobeene.gamebacklog.platform.service.PlatformAccountService;
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
        Platform steam = savePlatform("Steam");
        Device pc = saveDevice("Windows PC");
        platformAccountService.register(member.getId(), steam.getId(), "본계정");

        mockMvc.perform(post("/api/me/devices").header("X-Member-Id", member.getId())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"deviceId\":" + pc.getId() + ",\"label\":\"거실용\"}"));
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
                .andExpect(jsonPath("$.devices[0].device.name").value("Windows PC"))
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
    public void options는_기기_마스터_전체를_준다() throws Exception {
        //given — 보유 기기로 등록하지 않은 기기도 선택지에 있어야 한다 (BR-PT-05)
        Member member = saveMember();
        saveDevice("Nintendo Switch");
        saveDevice("Windows PC");

        //when //then
        mockMvc.perform(get("/api/me/options").header("X-Member-Id", member.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.devices.length()").value(2));
    }

    @Test
    public void 삭제한_계정은_options에서_빠진다() throws Exception {
        //given
        Member member = saveMember();
        Platform steam = savePlatform("Steam");
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
        Platform steam = savePlatform("Steam");
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


    private Platform savePlatform(String name) {
        Platform platform = Platform.of(name);
        em.persist(platform);
        return platform;
    }

    private Device saveDevice(String name) {
        Device device = Device.of(name);
        em.persist(device);
        return device;
    }
}

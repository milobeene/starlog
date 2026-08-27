package com.milobeene.starlog.system.domain;

import com.milobeene.starlog.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;

/**
 * 앱 설정 한 줄 (2026-08-28).
 *
 * ## 왜 DB에 두나
 *
 * architecture §2의 경계표가 답을 갖고 있었다 — **"재시작이 필요한가"**가 기준이다.
 * DB·스토리지는 부팅 때 조립되므로 일렉트론이 갖고, **IGDB 키는 런타임에 바꿔도 되므로 앱 안**이다.
 * 그런데 그 자리를 안 만들어서 키가 연결 설정에만 있었고, **로컬 모드에서는 IGDB를 아예 못 썼다.**
 *
 * ## 회원을 안 붙인다
 *
 * 한 설치 = 한 사람이라 "누구의 설정이냐"가 항상 같은 답이다.
 * 게다가 이건 **이 기록(DB)에 딸린 설정**이지 사람에 딸린 게 아니다 —
 * 세이브파일을 옮기면 키도 함께 가는 게 맞다
 */
@Getter
@Entity
@Table(name = "app_setting")
public class AppSetting extends BaseEntity {

    @Id
    @Column(name = "setting_key", length = 100)
    private String key;

    @Column(name = "setting_value", columnDefinition = "TEXT")
    private String value;

    protected AppSetting() {}

    public static AppSetting of(String key, String value) {
        AppSetting setting = new AppSetting();
        setting.key = key;
        setting.value = value;
        return setting;
    }

    public void update(String value) {
        this.value = value;
    }
}

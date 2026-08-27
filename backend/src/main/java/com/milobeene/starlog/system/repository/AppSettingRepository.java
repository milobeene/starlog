package com.milobeene.starlog.system.repository;

import com.milobeene.starlog.common.repository.BaseRepository;
import com.milobeene.starlog.system.domain.AppSetting;

import java.util.List;

public interface AppSettingRepository extends BaseRepository<AppSetting, String> {

    /** 두 줄뿐이라 통째로 읽는다. 키마다 조회하면 그게 곧 N+1이다 */
    List<AppSetting> findAll();
}

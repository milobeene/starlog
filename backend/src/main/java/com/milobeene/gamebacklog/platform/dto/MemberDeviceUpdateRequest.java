package com.milobeene.gamebacklog.platform.dto;

/** 보유 기기 수정. 기기 마스터는 못 바꾼다 */
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record MemberDeviceUpdateRequest(@NotBlank @Size(max = 50) String label,
                                        @Size(max = 2000) String memo) {
}

package com.milobeene.gamebacklog.platform.dto;

/** 보유 기기 등록 (FR-PLT-03). 같은 기종을 여러 대 가질 수 있어 label로 구분한다 */
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record MemberDeviceCreateRequest(@NotNull Long deviceId,
                                        @NotBlank @Size(max = 50) String label,
                                        @Size(max = 2000) String memo) {
}

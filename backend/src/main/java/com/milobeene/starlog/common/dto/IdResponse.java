package com.milobeene.starlog.common.dto;

/**
 * 생성 응답 바디. 201 + Location 헤더와 함께 나간다.
 * 헤더만 줘도 규약상 맞지만, 프론트가 헤더를 파싱하는 것보다 바디에서 꺼내는 게 싸다
 */
public record IdResponse(Long id) {

    public static IdResponse of(Long id) {
        return new IdResponse(id);
    }
}

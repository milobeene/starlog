package com.milobeene.gamebacklog.auth.service;

/**
 * 테스트에서 토큰 해시를 직접 만들어야 할 때 쓰는 창구.
 * TokenValues를 public으로 열면 다른 곳에서 토큰 해싱을 흉내 낼 수 있게 되므로 이 문만 연다.
 */
public final class TokenValuesTestAccess {

    private TokenValuesTestAccess() {}

    public static String hash(String rawToken) {
        return TokenValues.hash(rawToken);
    }
}

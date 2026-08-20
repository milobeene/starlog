package com.milobeene.gamebacklog.backlog.domain;

public enum PlaythroughStatus {
    PLAYING, PAUSED, DROPPED, COMPLETED;

    /** PLAYING은 "지금 하는 중"이라 종료일이 있으면 모순이다 */
    public boolean mustBeOpen() {
        return this == PLAYING;
    }

    /**
     * 끝난 회차는 언제 끝났는지가 있어야 한다.
     * PAUSED는 둘 다 아니라 자유다 — "6/3~6/11 하다 멈춤"과 "시작하고 멈춤" 둘 다 표현된다
     */
    public boolean mustBeClosed() {
        return this == DROPPED || this == COMPLETED;
    }

    /** §7.6 — 최신 회차의 상태가 곧 항목 상태다. switch로 두면 상태가 늘 때 컴파일러가 잡아준다 */
    public BacklogStatus toBacklogStatus() {
        return switch (this) {
            case PLAYING -> BacklogStatus.PLAYING;
            case PAUSED -> BacklogStatus.PAUSED;
            case DROPPED -> BacklogStatus.DROPPED;
            case COMPLETED -> BacklogStatus.COMPLETED;
        };
    }
}

package com.milobeene.gamebacklog.backlog.domain;

public enum PlaythroughStatus {
    PLAYING, PAUSED, DROPPED, COMPLETED;

    /** PLAYING·PAUSED는 둘 다 진행 중 = 종료일이 없다 (BR-PT-03) */
    public boolean isInProgress() {
        return this == PLAYING || this == PAUSED;
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

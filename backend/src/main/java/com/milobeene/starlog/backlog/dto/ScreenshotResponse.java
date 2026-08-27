package com.milobeene.starlog.backlog.dto;

/**
 * 스크린샷 한 장 (v1.0 7단계).
 *
 * **DB에 행이 없다.** 캡션도 순서도 안 주기로 했으므로(결정 41) 저장할 것이 파일 말고 없고,
 * 그러면 **폴더를 읽는 게 곧 목록**이다. 테이블을 두면 사용자가 탐색기에서 파일을 지웠을 때
 * 행과 파일이 어긋나는 상태를 평생 관리해야 한다 — 탐색기 열기를 주기로 한 이상
 * **파일이 진실이어야** 앞뒤가 맞는다
 */
public record ScreenshotResponse(String fileName,
                                 String url,
                                 long sizeBytes,
                                 /** `image/png` · `video/mp4` … 화면이 <img>냐 <video>냐를 이걸로 가른다 */
                                 String contentType,
                                 /**
                                  * 원본을 찍은 시각. 저장할 때 파일 수정시각에 심어둔 값이다.
                                  * **넣은 순서가 아니라 찍은 순서로 보여주려는 것** —
                                  * 옛 스크린샷 스무 장을 한꺼번에 넣어도 순서가 맞는다
                                  */
                                 String takenAt) {}

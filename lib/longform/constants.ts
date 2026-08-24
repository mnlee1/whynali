/**
 * lib/longform/constants.ts
 *
 * 옴니버스형 롱폼(완료된 숏폼 여러 개를 이어붙인 영상) 공통 상수.
 */

// 기존 숏폼과 동일한 세로 캔버스 기준 (lib/shortform/generate-scenes.ts의 WIDTH/HEIGHT와 동일)
export const WIDTH = 720
export const HEIGHT = 1280
export const FPS = 30

// lib/shortform/create-multi-video.ts의 SEARCH_SCENE_DUR 상수는 3.5초지만,
// 실제 렌더링된 영상을 프레임 단위로 확인한 결과 검색씬 실제 길이는 ~4.6~4.7초였음
// (콘텐츠 씬 hold-time 등으로 실측치가 상수보다 김) — 5.5초로 여유 있게 트림
export const SEARCH_SCENE_TRIM = 5.5

export const FADE_DUR = 0.3

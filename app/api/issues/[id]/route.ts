/**
 * app/api/issues/[id]/route.ts
 *
 * 2026-09-10 보안 점검에서 제거됨: GET(승인/노출 필터 없이 전체 조회),
 * PATCH·DELETE(인증 없이 아무나 이슈 수정/삭제 가능)가 프론트 어디에서도
 * 호출되지 않는 상태로 방치되어 있어 제거함.
 *
 * 이슈 상세 조회는 app/issue/[id]/page.tsx가 자체 쿼리로 처리하고,
 * 관리자 수정/삭제는 app/api/admin/issues/[id]/route.ts를 사용한다.
 */

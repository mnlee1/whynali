# 관리자 이슈 목록 NULL 처리 수정

날짜: 2026-03-12

## 문제 상황

관리자 페이지(`/admin/issues`)에서 이슈 목록이 전혀 표시되지 않았으나, 사용자 페이지에는 승인된 이슈 7개가 정상적으로 노출되고 있었습니다.

## 원인 분석

### 1. 데이터베이스 상태 확인

```
전체 이슈 통계:
- 승인: 7개
- 대기: 11개
- 반려: 4개
- 총 22개

source_track 컬럼:
- NULL: 21개
- track_a: 1개
```

### 2. API 쿼리 문제

`app/api/admin/issues/route.ts` 파일의 쿼리:

```typescript
// 문제가 있던 코드 (수정 전)
let query = supabaseAdmin
    .from('issues')
    .select('*', { count: 'exact' })
    .not('approval_status', 'is', null)  // 이 구문이 제대로 작동하지 않음
    .neq('approval_status', '병합됨')
    .order('heat_index', { ascending: false, nullsFirst: false })

// 트랙 A 제외 필터
if (excludeTrackA === 'true') {
    query = query.neq('source_track', 'track_a')  // NULL 값이 제외됨
}
```

문제점:
1. `.not('approval_status', 'is', null)` 구문이 Supabase에서 예상대로 작동하지 않음
2. `.neq('source_track', 'track_a')` 조건이 `source_track`이 NULL인 행을 제외시킴

SQL에서 `NULL != 'track_a'`는 `NULL`을 반환하므로, NULL 값을 가진 행이 필터링됩니다.

## 해결 방법

### 1. approval_status 필터 수정

```typescript
// 수정 후
let query = supabaseAdmin
    .from('issues')
    .select('*', { count: 'exact' })
    .in('approval_status', ['대기', '승인', '반려'])  // 명시적으로 상태 지정
    .order('heat_index', { ascending: false, nullsFirst: false })
```

### 2. source_track NULL 처리

```typescript
// 수정 후
if (excludeTrackA === 'true') {
    query = query.or('source_track.is.null,source_track.neq.track_a')
}
```

이렇게 하면:
- `source_track`이 NULL인 이슈들도 포함
- `source_track`이 'track_a'가 아닌 이슈들도 포함
- `source_track`이 'track_a'인 이슈만 제외

## 검증 결과

### API 테스트

```bash
curl "http://localhost:3000/api/admin/issues?exclude_track_a=true"
```

응답:
```json
{
    "total": 22,
    "urgentCount": 0,
    "data": [...]
}
```

### 승인된 이슈만 필터링

```bash
curl "http://localhost:3000/api/admin/issues?exclude_track_a=true&approval_status=승인"
```

응답:
```json
{
    "total": 7,
    "urgentCount": 0,
    "data": [...]
}
```

## 수정된 파일

- `app/api/admin/issues/route.ts`
  - approval_status 필터 수정 (라인 45-51)
  - source_track NULL 처리 추가 (라인 68-71)

## 참고사항

Supabase/PostgreSQL에서 NULL 처리 시 주의사항:

1. `NULL = value` → NULL (false가 아님)
2. `NULL != value` → NULL (true가 아님)
3. NULL 값을 포함하려면 `.is(null)` 또는 `.or()` 사용
4. NULL 값을 제외하려면 `.not('column', 'is', null)` 또는 `.filter('column', 'not.is', null)` 사용

이슈 목록에서 NULL 처리는 매우 중요하며, 특히 선택적 컬럼(`source_track` 등)에서 자주 발생하는 문제입니다.

# source_track null 이슈 해결 가이드

## 문제 상황

사용자가 사이트에서 특정 이슈("대법, 윤석준 대구 동구청장 당선무효형 확정…정치자금법 위반")를 보고 있으나, 관리자 페이지 이슈 목록에는 해당 이슈가 표시되지 않는 문제가 발생했습니다.

## 원인 분석

### 1. DB 상태 확인

해당 이슈의 DB 데이터:

```
ID: 8b9bd371-5692-419a-ab55-16ea295e102e
제목: 대법, 윤석준 대구 동구청장 당선무효형 확정…정치자금법 위반
approval_status: 승인
visibility_status: visible
heat_index: 24
merged_into_id: null
source_track: null  ← 문제의 원인
```

### 2. API 필터링 차이

#### 일반 사용자 API (`/api/issues`)

```typescript
let query = supabaseAdmin
    .from('issues')
    .select('*', { count: 'exact' })
    .eq('approval_status', '승인')
    .eq('visibility_status', 'visible')
    .is('merged_into_id', null)
    .gte('heat_index', MIN_HEAT_TO_REGISTER)
```

`source_track` 필터가 없어서 정상 노출됨.

#### 관리자 API (`/api/admin/issues`)

```typescript
// source_track 필터 적용 (Track A 이슈만 표시)
if (sourceTrack) {
    query = query.eq('source_track', sourceTrack)
}
```

관리자 페이지에서는 `source_track=track_a` 파라미터를 전달하는데, 해당 이슈는 `source_track=null`이므로 필터링에서 제외됨.

### 3. source_track이 null이 된 원인

수동 이슈 생성 API (`/api/issues POST`)에서 `source_track` 필드를 설정하지 않아서 null로 저장되었습니다.

```typescript
// 수정 전 코드 (app/api/issues/route.ts)
const { data: newIssue, error } = await supabaseAdmin
    .from('issues')
    .insert({
        title: title.trim(),
        description: description?.trim() ?? null,
        status: status ?? '점화',
        category: category ?? '사회',
        approval_status: '대기',
        // source_track 누락
    })
```

## 해결 방법

### 1. 즉시 조치: 기존 null 데이터 수정

총 3개의 이슈가 `source_track=null` 상태였으며, 모두 `track_a`로 업데이트 완료:

```bash
npx tsx scripts/fix_all_null_source_track.ts
```

업데이트된 이슈:
- 대법, 윤석준 대구 동구청장 당선무효형 확정…정치자금법 위반
- 이탈리아, 9-1로 멕시코 완파…'어부지리' 미국 B조 2위로 8강 진출[2026
- '피는 못 속여' ML 555홈런 타자의 아들 '미국전 멀티포 작렬' [WBC]

### 2. 근본 해결: 코드 수정

#### A. 수동 이슈 생성 API 수정

`app/api/issues/route.ts`:

```typescript
const { data: newIssue, error } = await supabaseAdmin
    .from('issues')
    .insert({
        title: title.trim(),
        description: description?.trim() ?? null,
        status: status ?? '점화',
        category: category ?? '사회',
        approval_status: '대기',
        source_track: 'manual',  // 추가
    })
```

#### B. 관리자 API 필터링 수정

`app/api/admin/issues/route.ts`:

```typescript
// source_track 필터 적용 (Track A 이슈만 표시)
// null 값도 포함하도록 수정 (레거시 데이터 대응)
if (sourceTrack) {
    query = query.or(`source_track.eq.${sourceTrack},source_track.is.null`)
}
```

이제 `source_track=track_a` 필터를 사용해도 null 값을 가진 레거시 이슈들이 함께 표시됩니다.

## 검증 스크립트

향후 같은 문제가 발생하면 다음 스크립트로 확인 가능:

### 1. 특정 이슈 조회

```bash
npx tsx scripts/check_specific_issue_detail.ts
```

### 2. source_track이 null인 승인된 이슈 조회

```bash
npx tsx scripts/check_null_source_track_issues.ts
```

### 3. 일괄 수정

```bash
npx tsx scripts/fix_all_null_source_track.ts
```

## source_track 값 정의

- `track_a`: 트랙 A 크론(커뮤니티 급증 감지)으로 생성된 이슈
- `manual`: 수동으로 생성된 이슈 (API를 통한 직접 생성)
- `null`: 레거시 데이터 (향후 발생하지 않아야 함)

## 재발 방지

1. 새로운 이슈 생성 API를 만들 때는 반드시 `source_track` 필드를 명시
2. 관리자 페이지에서 null 값도 함께 표시되도록 필터 수정 완료
3. 주기적으로 `check_null_source_track_issues.ts` 스크립트를 실행하여 null 값이 생기지 않는지 모니터링

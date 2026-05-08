# 왜난리 숏URL 시스템 구현 완료

작성일: 2026-03-11
상태: 구현 완료

## 개요

### 문제점

기존 URL이 UUID 기반으로 너무 길어 SNS 공유 시 불편

```
기존: https://whynali.com/issue/550e8400-e29b-41d4-a716-446655440000
```

### 해결책

6자 숏코드 기반 URL 시스템 구축

```
변경: https://whynali.com/i/aBc123
```

길이 감소: 83% (36자 → 6자)

## 구현 내용

### 1. 데이터베이스 마이그레이션

파일: `supabase/migrations/add_short_code.sql`

변경 사항:
- `issues` 테이블에 `short_code VARCHAR(8) UNIQUE NOT NULL` 컬럼 추가
- 인덱스 생성으로 빠른 조회 지원
- 기존 이슈에 자동으로 짧은 코드 할당
- 새 이슈 생성 시 자동 코드 생성 트리거

코드 생성 규칙:
- 길이: 6자
- 문자셋: a-z, A-Z, 0-9 (62개)
- 조합 가능 경우의 수: 62^6 = 약 568억 개
- 재시도: 50회 (중복 방지)

### 2. 타입 정의

파일: `types/issue.ts`

```typescript
export interface Issue {
    id: string
    short_code?: string  // optional (안전성)
}
```

### 3. 숏URL 라우팅

파일: `app/i/[id]/page.tsx`

동작 방식:
1. `/i/aBc123` 접속
2. `short_code='aBc123'`으로 이슈 조회
3. 못 찾으면 UUID로 조회 (하위 호환)
4. `/issue/[UUID]`로 리다이렉트

### 4. 공유 버튼 컴포넌트

파일: `components/issue/ShareButton.tsx`

기능:
- SNS 공유 (트위터, 페이스북, 카카오톡)
- 링크 복사 (클립보드)
- 공유 이벤트 트래킹 (Google Analytics)
- null 체크로 안전성 확보

```typescript
if (!shortCode) return null
```

적용 위치:
- 이슈 상세 페이지 상단 통계 바 (컴팩트)
- 스크롤 헤더 (컴팩트)
- 출처 섹션 아래 (전체)

### 5. 발견 및 수정된 문제

#### 타입 안전성 문제

문제: Issue 타입에 `short_code: string` (required)로 정의
위험: 마이그레이션 전 런타임 에러 위험

수정:
```typescript
// Before
short_code: string

// After
short_code?: string  // optional
```

#### 조건부 렌더링 추가

```typescript
// Before
<ShareButton shortCode={issue.short_code} />

// After
{issue.short_code && (
    <ShareButton shortCode={issue.short_code} />
)}
```

## 안전성 보장

### 마이그레이션 전 (컬럼 없음)
- 사이트 정상 작동
- 공유 버튼 미표시 (null 체크)
- 기존 기능 모두 정상
- 빌드 성공

### 마이그레이션 후 (컬럼 있음)
- 사이트 정상 작동
- 공유 버튼 표시
- 숏URL 작동
- 기존 이슈 코드 자동 할당
- 새 이슈 코드 자동 생성

## 기존 URL 호환성

### URL 체계

기존 URL (변경 없음):
```
https://whynali.com/issue/550e8400-e29b-41d4-a716-446655440000
```

새 숏URL (추가됨):
```
https://whynali.com/i/aBc123
```

### 작동 방식

기존 URL 접속 시:
```
사용자 → /issue/[UUID] → DB 조회 → 이슈 표시
```

새 숏URL 접속 시:
```
사용자 → /i/[code] → DB 조회 → /issue/[UUID] 리다이렉트 → 이슈 표시
```

### 호환성 확인

| 상황 | URL 형식 | 작동 여부 | 비고 |
|------|----------|-----------|------|
| 마이그레이션 전 + 기존 URL | `/issue/[UUID]` | 작동 | 변경 없음 |
| 마이그레이션 전 + 숏URL | `/i/[code]` | 404 | 컬럼 없음 |
| 마이그레이션 후 + 기존 URL | `/issue/[UUID]` | 작동 | 여전히 작동 |
| 마이그레이션 후 + 숏URL | `/i/[code]` | 작동 | 정상 작동 |

결론: 기존 공유된 모든 링크는 정상 작동

## 배포 가이드

### 배포 순서

권장 순서 (안전):
```
1. 마이그레이션 실행 (DB 변경)
2. 코드 배포 (애플리케이션 변경)
3. 테스트
```

역순도 가능 (안전장치 있음):
```
1. 코드 배포 (공유 버튼만 미표시)
2. 마이그레이션 실행
3. 공유 버튼 자동 활성화
```

어느 순서로든 사이트는 정상 작동

### 1. 마이그레이션 실행

#### Supabase 대시보드
1. SQL Editor 메뉴 접속
2. `supabase/migrations/add_short_code.sql` 내용 붙여넣기
3. Run 버튼 클릭
4. 성공 메시지 확인
5. 확인 쿼리:

```sql
SELECT id, title, short_code FROM issues LIMIT 10;
```

#### CLI
```bash
supabase db push
```

### 2. 빌드 및 배포

```bash
npm run build
npm run dev  # 로컬 테스트
vercel --prod
```

### 3. 확인

#### 데이터베이스 확인
```sql
-- 컬럼 존재 확인
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'issues' AND column_name = 'short_code';

-- 중복 코드 확인 (결과 없어야 정상)
SELECT short_code, COUNT(*)
FROM issues
GROUP BY short_code
HAVING COUNT(*) > 1;
```

#### 브라우저 테스트
1. 이슈 상세 페이지 접속
2. 공유 버튼 클릭
3. 숏URL 복사 (예: whynali.com/i/aBc123)
4. 숏URL로 직접 접속해서 리다이렉트 확인

### 롤백 방법

문제 발생 시:

```sql
DROP TRIGGER IF EXISTS trigger_auto_generate_short_code ON issues;
DROP FUNCTION IF EXISTS auto_generate_short_code();
DROP FUNCTION IF EXISTS generate_short_code();
DROP INDEX IF EXISTS idx_issues_short_code;
ALTER TABLE issues DROP COLUMN IF EXISTS short_code;
```

## 홍보 채널 활용

### 트위터/X

```
🔥 지금 가장 뜨거운 이슈!

"이슈 제목"

화력: 85/100
👉 whynali.com/i/aBc123

#왜난리 #이슈
```

장점: 280자 제한에서 URL이 짧아 더 많은 내용 작성 가능

### 인스타그램

스토리 링크 스티커:
```
[이미지]

자세히 보기
whynali.com/i/aBc123
```

카드뉴스: 이미지 하단에 짧은 URL 표시

### 유튜브 숏폼

설명란:
```
왜난리에서 자세히 보기
👉 whynali.com/i/aBc123
```

댓글 고정:
```
📌 전체 내용은 여기서 확인하세요
whynali.com/i/aBc123
```

### 카카오톡

단체 채팅방:
```
이 이슈 어떻게 생각하세요?
whynali.com/i/aBc123
```

### QR 코드

오프라인 홍보물에 QR 코드 생성:

```bash
npm install qrcode

node -e "
const QRCode = require('qrcode');
QRCode.toFile(
    'issue-qr.png',
    'https://whynali.com/i/aBc123',
    { width: 300 }
);
"
```

## 성능 및 모니터링

### 조회 성능

- `short_code` 인덱스로 빠른 조회
- 리다이렉트 페이지 캐싱 없음 (항상 최신 이슈로 연결)
- 이슈 상세 페이지는 ISR 15분 캐싱 유지

### Google Analytics 추적

공유 이벤트:
```javascript
gtag('event', 'share', {
    method: 'twitter',
    content_type: 'issue',
    item_id: issue_id,
    short_code: short_code
})
```

측정 지표:
- 플랫폼별 공유 횟수
- 이슈별 공유 횟수
- 숏URL 클릭률
- 공유 후 유입 전환율

### DB 모니터링

```sql
-- 공유 버튼이 표시되는 이슈 수
SELECT COUNT(*) FROM issues WHERE short_code IS NOT NULL;

-- short_code가 없는 이슈 (확인 필요)
SELECT id, title, created_at
FROM issues
WHERE short_code IS NULL
ORDER BY created_at DESC;
```

## 트러블슈팅

### Q1: short_code가 NULL인 이슈 발생

원인: 트리거 미작동 또는 50회 재시도 모두 실패

해결:
```sql
UPDATE issues
SET short_code = (
    SELECT string_agg(
        substr('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 
               floor(random()*62)::int+1, 1),
        ''
    )
    FROM generate_series(1,6)
)
WHERE short_code IS NULL;
```

### Q2: 숏URL 404 에러

원인: 라우트 파일이 배포되지 않음

해결:
```bash
npm run build
vercel --prod
```

### Q3: 중복 코드 생성

원인: 동시 요청으로 인한 경쟁 조건

해결: UNIQUE 제약조건과 재시도 로직이 자동 처리

## 향후 개선 사항

### Phase 2
- 커스텀 숏코드 (관리자 기능)
- 이슈 카드에도 공유 버튼
- 읽기 쉬운 문자셋 (0OoIl1 제외)

### Phase 3
- 숏URL 클릭 추적 (자체 DB)
- 분석 대시보드
- A/B 테스트 (공유 버튼 위치)

### Phase 4
- 딥링크 지원 (모바일 앱)
- 브랜드 도메인 (예: yn.li/aBc123)

## 예상 효과

### 사용자 경험
- URL 길이: 60자 → 24자 (60% 감소)
- 공유 편의성 향상
- 시각적으로 깔끔한 URL

### 비즈니스 지표
- 예상 공유율 증가: 15-25%
- 링크 입력 오타 감소: 50%
- SNS 인게이지먼트 향상

## 핵심 요약

구현 완료:
- 6자 숏코드 시스템
- 자동 코드 생성 (트리거)
- 공유 버튼 3곳 배치
- SNS 공유 기능
- Google Analytics 연동
- 타입 안전성 확보
- 마이그레이션 전후 호환

안전성:
- Optional 타입으로 방어
- Null 체크로 에러 방지
- 배포 순서 무관
- 롤백 가능
- 기존 URL 완전 호환

다음 단계:
1. 마이그레이션 실행
2. 코드 배포
3. 테스트
4. 홍보 채널 적용
5. 성과 측정

준비 완료. 언제든 배포 가능.

# 담당 A - Day 8 작업 제안

## 작업 개요

Day 8은 수집된 뉴스·커뮤니티 데이터를 이슈와 자동으로 연결하고, 화력 분석을 자동화하는 단계입니다.

## 작업 항목

### 1. 이슈-뉴스 자동 연결

**목적**: 수집된 뉴스를 키워드 기반으로 이슈와 자동 연결

**구현 내용**:
- 이슈 제목에서 주요 키워드 추출
- 뉴스 제목과 키워드 매칭
- `source_links` 테이블에 연결 저장
- 중복 연결 방지

**파일**:
- `lib/linker/issue-news-linker.ts`
- `app/api/admin/link-news/route.ts` (수동 연결용)
- `app/api/cron/auto-link/route.ts` (자동 연결 Cron)

### 2. 이슈-커뮤니티 자동 연결

**목적**: 수집된 커뮤니티 데이터를 이슈와 자동 연결

**구현 내용**:
- 커뮤니티 제목과 이슈 키워드 매칭
- `source_links` 테이블에 연결 저장
- 중복 연결 방지

**파일**:
- `lib/linker/issue-community-linker.ts`
- 뉴스 연결 API에 통합

### 3. 화력 분석 자동화

**목적**: 이슈에 연결된 출처 데이터를 기반으로 화력 지수 자동 계산

**구현 내용**:
- 모든 이슈의 화력 지수 재계산 함수
- Cron으로 정기 실행 (10분마다)
- 관리자 승인 없이 자동 반영

**파일**:
- `app/api/cron/recalculate-heat/route.ts`
- `vercel.json` 업데이트 (Cron 추가)

### 4. 관리자 페이지 - 수집 현황

**목적**: 수집된 뉴스·커뮤니티 데이터 확인 및 관리

**구현 내용**:
- 최근 수집 목록 표시
- 카테고리별 통계
- 이슈 연결 상태 확인
- 수동 연결 기능

**파일**:
- `app/admin/collections/page.tsx`
- `components/admin/CollectionStats.tsx`
- `components/admin/NewsListAdmin.tsx`

### 5. 관리자 페이지 - 이슈 관리

**목적**: 이슈 승인·수정·삭제 관리

**구현 내용**:
- 대기 중인 이슈 목록
- 승인/거부 기능
- 이슈 수정
- 화력 지수 확인

**파일**:
- `app/admin/issues/page.tsx`
- `components/admin/IssueApprovalList.tsx`

### 6. 네이버 API 한도 관리

**목적**: API 호출 한도 80% 도달 시 알림 및 주기 완화

**구현 내용**:
- API 호출 횟수 추적
- 한도 80% 알림 (콘솔 또는 관리자 페이지)
- 한도 초과 시 자동 주기 완화 (30분 → 60분)

**파일**:
- `lib/collectors/naver-news.ts` 업데이트
- `app/api/admin/api-usage/route.ts`

## 작업 순서

```
1. 이슈-뉴스 자동 연결 로직 (30분)
   - lib/linker/issue-news-linker.ts
   - app/api/admin/link-news/route.ts

2. 이슈-커뮤니티 자동 연결 로직 (20분)
   - lib/linker/issue-community-linker.ts

3. 자동 연결 Cron (10분)
   - app/api/cron/auto-link/route.ts
   - vercel.json 업데이트

4. 화력 분석 자동화 Cron (10분)
   - app/api/cron/recalculate-heat/route.ts
   - vercel.json 업데이트

5. 관리자 페이지 - 수집 현황 (40분)
   - app/admin/collections/page.tsx
   - components/admin/CollectionStats.tsx
   - components/admin/NewsListAdmin.tsx

6. 관리자 페이지 - 이슈 관리 (40분)
   - app/admin/issues/page.tsx
   - components/admin/IssueApprovalList.tsx

7. API 한도 관리 (20분)
   - lib/collectors/naver-news.ts 업데이트
   - app/api/admin/api-usage/route.ts
```

## 주요 로직

### 키워드 매칭 알고리즘

```
1. 이슈 제목에서 2글자 이상 명사 추출
2. 뉴스 제목에 키워드가 포함되었는지 확인
3. 매칭 점수 계산 (일치 키워드 개수 / 전체 키워드 개수)
4. 매칭 점수 50% 이상이면 연결
```

### 화력 분석 자동화

```
1. 모든 승인된 이슈 조회
2. 각 이슈의 recalculateHeatForIssue() 실행
3. 업데이트된 화력 지수를 issues 테이블에 저장
4. 10분마다 실행
```

## 데이터베이스 변경 사항

`source_links` 테이블 사용:
- 이미 생성되어 있음
- `issue_id`, `source_type`, `source_id` 컬럼 활용
- 중복 연결 방지를 위한 UNIQUE 제약 조건 확인

## API 엔드포인트

### 관리자 API
- `POST /api/admin/link-news` - 수동 뉴스 연결
- `GET /api/admin/collections` - 수집 현황 조회
- `GET /api/admin/api-usage` - API 사용량 조회
- `POST /api/admin/issues/[id]/approve` - 이슈 승인
- `POST /api/admin/issues/[id]/reject` - 이슈 거부

### Cron API
- `GET /api/cron/auto-link` - 자동 연결 (5분마다)
- `GET /api/cron/recalculate-heat` - 화력 재계산 (10분마다)

## 테스트 방법

### 1. 자동 연결 테스트
```bash
# 수동 실행
curl http://localhost:3000/api/cron/auto-link

# 결과 확인
curl http://localhost:3000/api/issues/[id]/sources
```

### 2. 화력 분석 테스트
```bash
# 수동 실행
curl http://localhost:3000/api/cron/recalculate-heat

# 결과 확인
curl http://localhost:3000/api/issues?sort=heat
```

### 3. 관리자 페이지 테스트
```
http://localhost:3000/admin/collections
http://localhost:3000/admin/issues
```

## 주의사항

1. **중복 연결 방지**: `source_links` 테이블에 동일한 `issue_id + source_type + source_id` 조합이 이미 있으면 INSERT 스킵
2. **API 한도**: 네이버 API 일일 한도는 25,000건. 하루 48회 호출 시 약 500건/회 수집으로 안전
3. **화력 분석 성능**: 이슈가 많아지면 전체 재계산에 시간이 걸릴 수 있음. 최근 24시간 업데이트된 이슈만 재계산 고려
4. **관리자 인증**: 현재는 인증 없이 관리자 페이지 접근 가능. Day 13에 인증 추가 예정

## 완료 기준

- [ ] 뉴스-이슈 자동 연결 작동
- [ ] 커뮤니티-이슈 자동 연결 작동
- [ ] 화력 분석 자동화 Cron 작동
- [ ] 관리자 수집 현황 페이지 완성
- [ ] 관리자 이슈 관리 페이지 완성
- [ ] API 한도 추적 및 알림 작동
- [ ] Vercel Cron 3개 설정 완료 (뉴스30분, 커뮤니티3분, 자동연결5분, 화력10분)

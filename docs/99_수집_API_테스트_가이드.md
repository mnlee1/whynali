# 뉴스·커뮤니티 수집 API 테스트 가이드

## 사전 준비

1. `.env.local` 파일에 환경 변수가 올바르게 설정되어 있는지 확인
2. Supabase 프로젝트가 활성화(pause 해제) 상태인지 확인
3. 필요한 테이블이 모두 생성되어 있는지 확인

## 1. 개발 서버 실행

```bash
cd /Users/nhn/Documents/pub/@react/whynali
npm run dev
```

개발 서버가 `http://localhost:3000` (또는 다른 포트)에서 실행됩니다.

## 2. 뉴스 수집 API 테스트

### 2-1. API 호출

새 터미널을 열고 다음 명령어 실행:

```bash
curl http://localhost:3000/api/cron/collect-news
```

### 2-2. 예상 응답

성공 시:
```json
{
    "success": true,
    "collected": {
        "연예": 10,
        "스포츠": 8,
        "정치": 5
    },
    "timestamp": "2026-02-19T12:34:56.789Z"
}
```

실패 시:
```json
{
    "error": "COLLECTION_ERROR",
    "message": "뉴스 수집 실패"
}
```

### 2-3. Supabase에서 데이터 확인

**방법 1: Supabase Dashboard**
1. https://supabase.com/dashboard 접속
2. 프로젝트 선택 (`banhuygrqgezhlpyytc`)
3. 좌측 메뉴 `Table Editor` 클릭
4. `news_data` 테이블 선택
5. 최근 추가된 데이터 확인 (정렬: `created_at` 내림차순)

**방법 2: SQL Editor**
1. 좌측 메뉴 `SQL Editor` 클릭
2. 다음 쿼리 실행:

```sql
-- 최근 수집된 뉴스 10개
SELECT 
    id, 
    title, 
    source, 
    published_at, 
    created_at
FROM news_data 
ORDER BY created_at DESC 
LIMIT 10;

-- 카테고리별 수집 현황
SELECT 
    category, 
    COUNT(*) as count,
    MAX(created_at) as last_collected
FROM news_data 
GROUP BY category;
```

**방법 3: API로 확인**

브라우저에서 접속:
```
http://localhost:3000/api/dev/check-tables
```

또는 터미널에서:
```bash
# 테이블 존재 확인
curl http://localhost:3000/api/dev/check-tables

# 뉴스 데이터 확인 (별도 API 필요 시 추가 구현)
```

## 3. 커뮤니티 수집 API 테스트

### 3-1. API 호출

```bash
curl http://localhost:3000/api/cron/collect-community
```

### 3-2. 예상 응답

성공 시:
```json
{
    "success": true,
    "theqoo": {
        "collected": 15,
        "errors": 0
    },
    "natePann": {
        "collected": 12,
        "errors": 0
    },
    "timestamp": "2026-02-19T12:35:10.123Z"
}
```

### 3-3. Supabase에서 데이터 확인

**SQL Editor 쿼리:**

```sql
-- 최근 수집된 커뮤니티 글 10개
SELECT 
    id, 
    site, 
    title, 
    view_count, 
    comment_count, 
    scraped_at
FROM community_data 
ORDER BY scraped_at DESC 
LIMIT 10;

-- 사이트별 수집 현황
SELECT 
    site, 
    COUNT(*) as count,
    MAX(scraped_at) as last_scraped,
    SUM(view_count) as total_views,
    SUM(comment_count) as total_comments
FROM community_data 
GROUP BY site;
```

## 4. 수집된 데이터와 이슈 연결 확인

현재는 수집만 되고 이슈와의 연결은 아직 구현되지 않았습니다.
(Day 8 작업에서 구현 예정)

```sql
-- 이슈와 연결된 뉴스 확인
SELECT 
    i.title as issue_title,
    n.title as news_title,
    n.source,
    sl.created_at as linked_at
FROM source_links sl
JOIN issues i ON sl.issue_id = i.id
JOIN news_data n ON sl.source_id = n.id AND sl.source_type = 'news'
ORDER BY sl.created_at DESC
LIMIT 10;
```

## 5. 문제 해결

### 문제 1: "Unauthorized" 에러

```json
{"error":"Unauthorized"}
```

**해결**: `.env.local`에 `CRON_SECRET`이 설정되어 있는 경우, 헤더에 포함해서 호출:

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/collect-news
```

또는 `.env.local`에서 `CRON_SECRET` 라인을 주석 처리하거나 삭제.

### 문제 2: "fetch failed" 에러

**원인**: 
- Supabase 프로젝트가 pause 상태
- 환경 변수 오류
- 네트워크 문제

**해결**:
1. Supabase Dashboard에서 프로젝트 활성화
2. `.env.local` 확인
3. `npm run dev` 재시작

### 문제 3: "네이버 API 호출 실패"

**원인**:
- `NAVER_CLIENT_ID` 또는 `NAVER_CLIENT_SECRET` 미설정
- API 호출 한도 초과

**해결**:
1. `.env.local`에 네이버 API 키 확인
2. 네이버 개발자 센터에서 API 사용량 확인

### 문제 4: 데이터가 수집되지 않음

**체크리스트**:
- [ ] 네이버 API 키가 올바른가?
- [ ] Supabase 연결이 정상인가?
- [ ] 테이블 구조가 올바른가?
- [ ] 터미널 로그에 에러가 있는가?

**디버깅**:
```bash
# 개발 서버 로그 확인
# 터미널에서 에러 메시지 확인

# Supabase 테이블 구조 확인
curl http://localhost:3000/api/dev/check-tables
```

## 6. 실제 Cron 동작 테스트 (Vercel 배포 후)

Vercel에 배포한 후에는 자동으로 Cron이 실행됩니다:
- 뉴스: 30분마다
- 커뮤니티: 3분마다

**Vercel에서 Cron 로그 확인**:
1. Vercel Dashboard 접속
2. 프로젝트 선택
3. `Logs` 탭에서 `/api/cron/collect-news`, `/api/cron/collect-community` 검색

## 7. 빠른 테스트 체크리스트

```bash
# 1. 개발 서버 실행
npm run dev

# 2. 뉴스 수집 테스트
curl http://localhost:3000/api/cron/collect-news

# 3. 커뮤니티 수집 테스트
curl http://localhost:3000/api/cron/collect-community

# 4. 테이블 확인
curl http://localhost:3000/api/dev/check-tables
```

Supabase Dashboard에서 `news_data`, `community_data` 테이블에 데이터가 추가되었는지 확인.

---

**다음 단계**: 수집된 데이터를 이슈와 자동으로 연결하는 로직 구현 (Day 8)

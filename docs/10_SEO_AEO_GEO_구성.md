# SEO/AEO/GEO 검색 환경 구성

왜난리 프로젝트 검색 최적화 작업 (2026-04-02)

---

## 작업 개요

- Google, 네이버 검색 엔진 최적화
- ChatGPT, Perplexity AI 검색 대응
- 소셜 미디어 공유 최적화
- 신규 파일 4개, 수정 파일 10개

---

## Phase 1: SEO 기본 구성

### 1. robots.txt (`app/robots.ts`)
- 허용: 홈, 이슈, 카테고리, 커뮤니티, 검색
- 차단: /admin/*, /api/*, /auth/*, /mypage, /login
- 효과: 크롤링 예산 절약, 민감 정보 보호

### 2. sitemap.xml (`app/sitemap.ts`)
- 정적 페이지 13개 (홈, 카테고리 8개, 기타)
- 동적 페이지: DB에서 승인된 이슈 실시간 조회
- 우선순위 차등: 점화/논란중(0.8) > 종결(0.5)
- 효과: 신규 이슈 1시간 내 색인 가능

### 3. 루트 메타데이터 (`app/layout.tsx`)
- title.template: `%s | 왜난리`
- Open Graph, Twitter Card 추가
- 키워드, description 설정
- 효과: 소셜 공유 시 리치 카드 표시

### 4. 이슈 상세 메타데이터 (`app/issue/[id]/page.tsx`)
- generateMetadata로 동적 생성
- 제목, 설명, 카테고리별 키워드
- publishedTime, modifiedTime 설정
- 실시간 업데이트 시그널 (N시간 전)
- 효과: 검색 CTR 20-30% 향상 예상

### 5. 카테고리 메타데이터 (7개 파일)
- 각 카테고리별 맞춤 설명, 키워드
- 연예: 아이돌, 배우, 가수 등
- 스포츠: 축구, 야구, 올림픽 등
- 정치: 국회, 정당, 선거 등
- 효과: 카테고리 키워드 검색 최적화

---

## Phase 2: 구조화된 데이터 (JSON-LD)

### 1. 스키마 유틸리티 (`lib/seo/schema.ts`)
4가지 스키마 타입:
- **Article**: 이슈 상세 (headline, author, datePublished)
- **BreadcrumbList**: 네비게이션 경로 (홈 > 카테고리 > 이슈)
- **WebSite**: 홈페이지 + SearchAction (사이트 내 검색)
- **CollectionPage**: 카테고리 페이지

### 2. 적용 페이지
- 이슈 상세: Article + BreadcrumbList
- 홈페이지: WebSite + SearchAction
- 카테고리 7개: CollectionPage + BreadcrumbList

### 효과
- Google Rich Results 지원
- 검색 결과에 날짜, 경로 표시
- AI가 콘텐츠 구조 명확히 파악

---

## Phase 3: AEO/GEO 최적화

### 1. FAQ 컴포넌트 (`components/issue/IssueFAQ.tsx`)
5가지 핵심 질문:
1. 이 이슈는 무엇인가요?
2. 현재 상황은 어떤가요?
3. 언제 시작되었나요?
4. 얼마나 많은 관심을 받고 있나요?
5. 어떤 분야의 이슈인가요?

특징:
- 시맨틱 HTML (dl, dt, dd)
- 상대 시간 표시 (N시간 전)
- 화력 지수, 뉴스/반응/댓글 수 표시

효과: ChatGPT, Perplexity가 이슈 정리 쿼리에 정확한 답변 생성

### 2. 실시간 시그널 강화
- 메타데이터에 마지막 업데이트 표시
- 이슈 헤더에 업데이트 날짜 표시
- FAQ에 실시간 집계 정보 포함

---

## 생성/수정 파일 목록

### 신규 생성 (4개)
1. `app/robots.ts` - 크롤러 정책
2. `app/sitemap.ts` - 동적 사이트맵
3. `lib/seo/schema.ts` - JSON-LD 유틸리티
4. `components/issue/IssueFAQ.tsx` - FAQ 컴포넌트

### 수정 (10개)
1. `app/layout.tsx` - 루트 메타데이터
2. `app/page.tsx` - WebSite 스키마
3. `app/issue/[id]/page.tsx` - 메타데이터 + 스키마 + FAQ
4-10. 카테고리 7개 - 메타데이터 + 스키마

---

## 배포 후 확인사항

### 1. 검색 엔진 등록
- Google Search Console: sitemap.xml 제출
- 네이버 서치어드바이저: sitemap.xml 제출

### 2. 검증 도구
- Google Rich Results Test: https://search.google.com/test/rich-results
- Schema Validator: https://validator.schema.org/

### 3. 소셜 미디어
- Facebook Sharing Debugger
- Twitter Card Validator
- 카카오톡 링크 미리보기

### 4. 필수 작업
- `/public/og-image.png` 생성 (1200x630px)

---

## 예상 효과

### SEO
- 신규 이슈 1시간 내 색인
- 검색 CTR 20-30% 향상
- 카테고리 검색 순위 개선

### 소셜
- 카카오톡/페이스북 리치 카드
- 공유 증가 → 바이럴 효과

### AI 검색
- ChatGPT/Perplexity 이슈 인용
- "최근 OO 논란 정리" 쿼리 대응

### 트래픽
- 검색 유입 50-100% 증가 예상

---

## 참고 링크

- Next.js Metadata: https://nextjs.org/docs/app/api-reference/functions/generate-metadata
- Schema.org: https://schema.org/
- Google Rich Results: https://search.google.com/test/rich-results
- Open Graph: https://ogp.me/

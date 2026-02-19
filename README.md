# 왜난리 (WhyNali)

한국 이슈를 한눈에 파악하고 여론을 확인하는 이슈 내비게이션 서비스

## 기술 스택

- **Frontend**: Next.js 14+ (App Router), React, TypeScript, Tailwind CSS
- **Backend/DB**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth (구글, 네이버, 카카오 오픈ID)
- **Deploy**: Vercel

## 로컬 실행 방법

### 1. 환경 변수 설정

`.env.example`을 복사하여 `.env.local` 생성 후 실제 값 입력:

```bash
cp .env.example .env.local
```

필요한 키:
- Supabase: URL, ANON_KEY, SERVICE_ROLE_KEY
- Naver: CLIENT_ID, CLIENT_SECRET (뉴스 API + 로그인)
- Kakao: CLIENT_ID, CLIENT_SECRET
- Google: CLIENT_ID, CLIENT_SECRET
- Perplexity: API_KEY (화력 분석 선택 시)

### 2. 패키지 설치

```bash
npm install
```

### 3. Supabase 테이블 생성

`supabase/schema.sql` 파일의 내용을 Supabase SQL Editor에서 실행

### 4. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 http://localhost:3000 접속

## 프로젝트 구조

```
whynali-02/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # 루트 레이아웃
│   ├── page.tsx           # 홈 (이슈 목록)
│   ├── entertain/         # 연예 카테고리
│   ├── sports/            # 스포츠 카테고리
│   ├── politics/          # 정치 카테고리
│   ├── society/           # 사회 카테고리
│   ├── tech/              # 기술 카테고리
│   ├── issue/[id]/        # 이슈 상세
│   ├── community/         # 커뮤니티 (토론 주제)
│   ├── search/            # 글로벌 검색
│   └── api/               # API 라우트
├── components/            # 공통 컴포넌트
│   └── layout/            # 레이아웃 컴포넌트
├── docs/                  # 기획·법적 검토 문서
├── supabase/              # DB 스키마
└── .env.example           # 환경 변수 템플릿
```

## 주요 기능 (MVP)

- **이슈 목록**: 카테고리별, 상태별 필터, 검색
- **이슈 상세**: 화력 분석, 타임라인, 감정 표현, 댓글, 투표
- **커뮤니티**: AI 생성 토론 주제, 철학적 관점 토론
- **글로벌 검색**: 이슈 + 토론 주제 통합 검색
- **관리자**: 이슈 승인, 수집 데이터 관리, 세이프티봇

## 문서

- `docs/01_AI기획.md`: 전체 기획 스펙
- `docs/02_AI기획_판단포인트.md`: 판단 포인트 기준
- `docs/07_이슈등록_화력_정렬_규격.md`: 구현 규격
- `docs/97_API규약.md`: API 규약
- `docs/98_로드맵.md`: 2주 개발 일정
- `docs/99_Git협업.md`: Git 브랜치 전략

## Git 브랜치 전략

- `main`: 배포용 (안정 상태)
- `dev`: 개발 통합
- `feature/담당-기능명`: 기능 작업

작업 흐름:
1. `dev`에서 `feature` 브랜치 생성
2. 작업 후 PR (dev로)
3. 리뷰 후 머지
4. `dev`에서 최신 코드 pull

자세한 내용: `docs/99_Git협업.md`

## 라이선스

Private

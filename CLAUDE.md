# CLAUDE.md

나는 웹디자이너라서, 설명을 내가 이해할 수 있는 수준으로 해줘야해.
너는 왜난리 서비스의 개발 파트너야.
Next.js 15, Supabase, Vercel 기반.
AI는 Claude api sonnet4.6(유료), groq(무료) 사용중.
이슈의 신뢰도, 정확도 판별 중요.
최대한 비용 덜 과금 되는 형태로 제안할 것.
한국어로 응답.

이 파일은 Claude Code(claude.ai/code)가 이 저장소에서 작업할 때 참고하는 가이드입니다.

## 명령어

```bash
npm run dev          # 개발 서버 시작
npm run build        # 프로덕션 빌드
npm run lint         # ESLint 실행
npm run test:e2e     # Playwright E2E 테스트 실행
npm run test:e2e:ui  # Playwright UI 모드 테스트 실행
npm run check:api    # AI API 사용 현황 조회 (실서버)
```

## 백업 및 복원

자동 백업 시스템이 매일 오전 9시에 실행됩니다.

```bash
npm run backup                              # 일반 데이터 백업
npm run backup:auth                         # Auth 사용자 백업 (주 1회)
npm run restore 2026-04-09                  # 일반 데이터 복원
npm run restore:auth 2026-04-09             # Auth 사용자 복원
npm run backup:cleanup                      # 오래된 백업 정리
```

⚠️ Auth 백업은 이메일 포함! 로컬에만 보관, GitHub 커밋 금지
📅 매주 월요일 오전 10시 두레이 알림 전송

자세한 내용: @docs/99_데이터베이스_백업_복구_가이드.md

## 아키텍처 개요

**왜난리 (WhyNali)** — 한국 이슈/논란 추적 서비스. 사용자가 트렌딩 이슈를 탐색하고, 반응하고, 투표하고, AI가 생성한 커뮤니티 토론에 참여하는 플랫폼.

### 기술 스택

- **Next.js 15 App Router** + React 19, TypeScript 5, Tailwind CSS
- **Supabase** (PostgreSQL) — ORM 없이 Supabase JS 클라이언트로 직접 SQL 쿼리
- **인증**: Supabase Auth + OAuth (Google, Naver, Kakao) + 온보딩 플로우
- **AI**: 멀티 프로바이더 (기본값 claude-fallback: Claude 우선 → Groq 폴백) — `/lib/ai/`
- **배포**: Vercel + Cron Jobs (백그라운드 처리)

### 핵심 도메인 개념

**이슈 상태 라이프사이클**: `대기` → 승인 → `점화` → `논란중` → `종결`

**이슈 등록 파이프라인 ("Track A")**:
1. Naver News API로 기사 수집
2. 3시간 내 기사 5건 이상 → 이슈 후보 자동 생성
3. 관리자 승인/반려; 화력 > 30이면 6시간 후 자동 승인
4. Cron으로 화력 지수 재계산 (`/api/cron/recalculate-heat`)

**이슈 카테고리 (8개)**: 연예, 스포츠, 정치, 사회, 경제, 기술, 세계, 생활문화

**반응 타입**: 좋아요, 싫어요, 화나요, 팝콘각, 응원, 애도, 사이다

### 데이터베이스

Supabase 클라이언트 2종:
- `/lib/supabase/client.ts` — 브라우저 클라이언트 (`createBrowserClient`)
- `/lib/supabase/server.ts` — 서버 어드민 클라이언트 (커넥션 풀링, 포트 6543)

스키마: `/supabase/schema.sql` / 마이그레이션: `/supabase/migrations/`

주요 테이블: `issues`, `news_data`, `users`, `comments`, `reactions`, `votes`, `discussion_topics`, `timeline_points`, `safety_rules`, `admin_logs`

### 인증 플로우

1. OAuth 리다이렉트 → `/auth/callback`에서 코드 교환 후 세션을 쿠키에 저장 (localStorage 아님)
2. 신규 유저 → `/onboarding`에서 약관 동의 + 익명 닉네임 배정
3. `middleware.ts`가 쓰기 API 라우트 보호 (`/api/comments`, `/api/reactions`, `/api/votes`, `/api/discussions`)
4. 어드민 권한은 서버 사이드에서 `ADMIN_EMAILS` 환경변수로 확인

### API 패턴

- 모든 API는 `/app/api/` 하위 (App Router 파일 기반 라우팅)
- 쿼리 파라미터: `?category=연예&status=점화&sort=heat&limit=20&offset=0`
- 에러 응답 형식: `{ error: 'CODE', message: '...' }`
- Cron 엔드포인트는 `CRON_SECRET` 헤더로 인증
- 어드민 엔드포인트: `/app/api/admin/`

### ISR & 성능

홈 페이지는 15분 주기 ISR 사용. `next.config.js`에서 React, vendor, 대형 라이브러리 webpack 청크 분리 설정.

## 환경 변수

필수:
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SITE_URL
```

주요 선택:
```
GROQ_API_KEY / ANTHROPIC_API_KEY
AI_PROVIDER=claude-fallback   # groq|claude|claude-fallback
ADMIN_EMAILS              # 쉼표 구분 어드민 이메일
CRON_SECRET               # Vercel cron 인증
NAVER_CLIENT_ID / NAVER_CLIENT_SECRET
```

이슈 파이프라인 임계값 (기본값 있음):
```
CANDIDATE_ALERT_THRESHOLD=5
CANDIDATE_AUTO_APPROVE_THRESHOLD=30
CANDIDATE_MIN_HEAT_TO_REGISTER=15
CANDIDATE_WINDOW_HOURS=24
CANDIDATE_NO_RESPONSE_HOURS=6
```


## Git 워크플로우

브랜치: `main` (프로덕션) → `develop` (통합) → `feature/*`
전체 전략은 `/docs/99_Git협업.md` 참고.

## 주요 문서

@docs/기획서.md
@docs/99_데이터베이스_백업_복구_가이드.md
@docs/99_미구현_미흡_정리.md
@docs/97_API규약.md

- `/types/issue.ts` — 핵심 TypeScript 타입 정의

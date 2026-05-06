# Google Analytics 4 설치 가이드

> Next.js 15 + Google Analytics 4 연동
> 소요 시간: 15분

## 1. Google Analytics 계정 생성

### 1.1 계정 만들기

1. [Google Analytics](https://analytics.google.com/) 접속
2. 시작하기 클릭
3. 계정 이름: "왜난리" 입력
4. 다음 단계 진행

### 1.2 속성 만들기

1. 속성 이름: "왜난리 프로덕션"
2. 시간대: 한국
3. 통화: 대한민국 원 (KRW)
4. 만들기 클릭

### 1.3 데이터 스트림 설정

1. 플랫폼: 웹 선택
2. 웹사이트 URL: `https://whynali.com`
3. 스트림 이름: "왜난리 웹"
4. 만들기 클릭

### 1.4 측정 ID 복사

생성되면 **측정 ID**가 표시됩니다.

형식: `G-XXXXXXXXXX`

이 ID를 복사해두세요.

## 2. Next.js에 Google Analytics 설치

### 2.1 패키지 설치

```bash
npm install @next/third-parties
```

### 2.2 환경 변수 추가

`.env.local` 파일에 추가:

```env
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
```

`.env.production` 파일에도 동일하게 추가.

### 2.3 RootLayout에 GA 스크립트 추가

`whynali/app/layout.tsx` 파일 수정:

```typescript
import { GoogleAnalytics } from '@next/third-parties/google'

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="ko">
            <body>
                {children}
                {process.env.NEXT_PUBLIC_GA_ID && (
                    <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />
                )}
            </body>
        </html>
    )
}
```

### 2.4 커스텀 이벤트 트래킹 추가

주요 사용자 행동을 트래킹합니다.

`whynali/lib/analytics.ts` 파일 생성:

```typescript
/**
 * whynali/lib/analytics.ts
 *
 * Google Analytics 이벤트 트래킹 유틸리티
 *
 * 사용자 행동(댓글, 반응, 투표 등)을 GA4로 전송합니다.
 */

export const GA_ID = process.env.NEXT_PUBLIC_GA_ID

// GA4 이벤트 전송
export const event = (
    action: string,
    category: string,
    label?: string,
    value?: number
) => {
    if (typeof window !== 'undefined' && window.gtag) {
        window.gtag('event', action, {
            event_category: category,
            event_label: label,
            value: value,
        })
    }
}

// 페이지뷰 트래킹 (자동 수집되므로 일반적으로 불필요)
export const pageview = (url: string) => {
    if (typeof window !== 'undefined' && window.gtag) {
        window.gtag('config', GA_ID!, {
            page_path: url,
        })
    }
}

// 주요 이벤트 래퍼 함수들
export const trackReaction = (issueId: string, reactionType: string) => {
    event('reaction', 'engagement', `${issueId}:${reactionType}`)
}

export const trackComment = (issueId: string) => {
    event('comment', 'engagement', issueId)
}

export const trackVote = (voteId: string, choiceId: string) => {
    event('vote', 'engagement', `${voteId}:${choiceId}`)
}

export const trackShare = (issueId: string, platform: string) => {
    event('share', 'social', `${issueId}:${platform}`)
}

export const trackIssueView = (issueId: string, category: string) => {
    event('view_issue', 'content', `${issueId}:${category}`)
}

// TypeScript 타입 정의
declare global {
    interface Window {
        gtag: (
            command: string,
            targetId: string,
            config?: Record<string, any>
        ) => void
    }
}
```

### 2.5 컴포넌트에서 이벤트 트래킹 사용

예시: 댓글 작성 시 트래킹

`whynali/components/issue/CommentsSection.tsx` 수정:

```typescript
import { trackComment } from '@/lib/analytics'

// 댓글 제출 핸들러 내부
const handleSubmit = async (content: string) => {
    // 기존 댓글 제출 로직
    await submitComment(content)

    // GA 이벤트 전송
    trackComment(issueId)
}
```

예시: 반응 클릭 시 트래킹

`whynali/components/issue/ReactionsSection.tsx` 수정:

```typescript
import { trackReaction } from '@/lib/analytics'

const handleReactionClick = async (type: string) => {
    // 기존 반응 로직
    await addReaction(type)

    // GA 이벤트 전송
    trackReaction(issueId, type)
}
```

## 3. 배포 및 확인

### 3.1 Vercel 환경 변수 설정

1. Vercel 대시보드 접속
2. 왜난리 프로젝트 선택
3. Settings > Environment Variables
4. `NEXT_PUBLIC_GA_ID` 추가
5. Production, Preview, Development 모두 체크
6. 재배포

### 3.2 실시간 데이터 확인

1. Google Analytics 대시보드
2. 보고서 > 실시간
3. 실제 사이트 방문하면 실시간으로 표시됨

### 3.3 주요 지표 확인 위치

| 지표 | Google Analytics 위치 |
|------|----------------------|
| DAU (일간 활성 사용자) | 보고서 > 사용자 > 사용자 개요 |
| 페이지뷰 | 보고서 > 수명 주기 > 참여도 > 페이지 및 화면 |
| 평균 체류 시간 | 보고서 > 수명 주기 > 참여도 > 참여도 개요 |
| 유입 경로 | 보고서 > 수명 주기 > 획득 > 트래픽 획득 |
| 이벤트 (댓글, 반응) | 보고서 > 수명 주기 > 참여도 > 이벤트 |

## 4. 커스텀 대시보드 만들기

### 4.1 왜난리 전용 대시보드 생성

1. Google Analytics > 탐색 > 만들기
2. 템플릿: 빈 화면
3. 대시보드 이름: "왜난리 주간 리포트"

### 4.2 필수 위젯 추가

**위젯 1: 일별 사용자 수**
- 차원: 날짜
- 측정항목: 활성 사용자
- 차트 유형: 선 그래프

**위젯 2: 이벤트 수**
- 차원: 이벤트 이름
- 측정항목: 이벤트 수
- 차트 유형: 막대 그래프
- 필터: 이벤트 이름에 "reaction", "comment", "vote" 포함

**위젯 3: 페이지뷰**
- 차원: 페이지 경로
- 측정항목: 조회수
- 차트 유형: 테이블

**위젯 4: 유입 경로**
- 차원: 소스/매체
- 측정항목: 신규 사용자
- 차트 유형: 파이 차트

## 5. 주간 리포트 자동화

### 5.1 이메일 알림 설정

1. Google Analytics > 관리 > 속성 > 이메일 알림
2. 새 알림 만들기
3. 이름: "왜난리 주간 리포트"
4. 빈도: 매주 월요일
5. 수신자: 팀 이메일 추가
6. 저장

### 5.2 Looker Studio 연동 (선택)

무료로 더 예쁜 리포트 만들기:

1. [Looker Studio](https://lookerstudio.google.com/) 접속
2. 새 보고서 만들기
3. 데이터 소스: Google Analytics 4 선택
4. 왜난리 속성 연결
5. 자동 차트 생성

## 6. 개인정보 보호 설정

### 6.1 IP 익명화 (GDPR 대응)

Google Analytics 4는 기본적으로 IP를 익명화합니다.
추가 설정 불필요.

### 6.2 쿠키 동의 배너 (선택)

한국은 GDPR 적용 대상이 아니지만, 투명성을 위해 선택적으로 추가 가능.

간단한 배너 예시:

```typescript
// whynali/components/CookieConsent.tsx
'use client'

import { useState, useEffect } from 'react'

export default function CookieConsent() {
    const [show, setShow] = useState(false)

    useEffect(() => {
        const consent = localStorage.getItem('cookie-consent')
        if (!consent) {
            setShow(true)
        }
    }, [])

    const handleAccept = () => {
        localStorage.setItem('cookie-consent', 'accepted')
        setShow(false)
    }

    if (!show) return null

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-gray-900 text-white p-4 z-50">
            <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
                <p className="text-sm">
                    서비스 개선을 위해 쿠키를 사용합니다.
                </p>
                <button
                    onClick={handleAccept}
                    className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700"
                >
                    동의
                </button>
            </div>
        </div>
    )
}
```

`app/layout.tsx`에 추가:

```typescript
import CookieConsent from '@/components/CookieConsent'

// ...
<body>
    {children}
    <CookieConsent />
</body>
```

## 7. 트러블슈팅

### 문제 1: 데이터가 수집 안 됨

**확인 사항:**
- 환경 변수 `NEXT_PUBLIC_GA_ID`가 올바른지 확인
- Vercel에 환경 변수 설정했는지 확인
- 재배포 했는지 확인
- 브라우저에서 gtag 스크립트 로드되는지 개발자 도구로 확인

### 문제 2: 이벤트가 안 보임

**확인 사항:**
- `lib/analytics.ts`가 제대로 임포트됐는지
- `event()` 함수가 호출되는지 콘솔 로그 확인
- Google Analytics 실시간 보고서에서 즉시 확인 가능

### 문제 3: DAU가 이상하게 측정됨

**원인:**
- 로컬 개발 환경도 집계될 수 있음

**해결:**
```typescript
// lib/analytics.ts 수정
export const event = (...) => {
    if (
        typeof window !== 'undefined' &&
        window.gtag &&
        process.env.NODE_ENV === 'production' // 프로덕션에서만 전송
    ) {
        window.gtag(...)
    }
}
```

## 8. 완료 체크리스트

- [ ] Google Analytics 계정 생성 완료
- [ ] 측정 ID 발급 및 환경 변수 설정 완료
- [ ] `@next/third-parties` 패키지 설치 완료
- [ ] `layout.tsx`에 GA 스크립트 추가 완료
- [ ] `lib/analytics.ts` 파일 생성 완료
- [ ] Vercel 환경 변수 설정 완료
- [ ] 재배포 완료
- [ ] Google Analytics 실시간 보고서에서 데이터 확인 완료
- [ ] 주요 이벤트 트래킹 추가 완료 (댓글, 반응, 투표)
- [ ] 커스텀 대시보드 생성 완료
- [ ] 주간 이메일 리포트 설정 완료

---

**다음 단계:**
`/docs/80_KPI_대시보드_구현_가이드.md` - 관리자 페이지에서 직접 KPI 확인하기

/**
 * components/analytics/PageTracker.tsx
 * 
 * [페이지 자동 추적 컴포넌트]
 * 
 * 클라이언트 컴포넌트로 페이지뷰를 자동 추적합니다.
 */

'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { trackPageView } from '@/lib/analytics/tracker'

export default function PageTracker() {
    const pathname = usePathname()
    const searchParams = useSearchParams()

    useEffect(() => {
        // 페이지 변경 시 자동 추적
        if (pathname === '/') {
            trackPageView({ pageType: 'home', pagePath: pathname })
        } else if (pathname.startsWith('/issues/')) {
            const issueId = pathname.split('/')[2]
            trackPageView({ pageType: 'issue', pagePath: pathname, issueId })
        } else if (pathname.startsWith('/discussions/')) {
            const discussionId = pathname.split('/')[2]
            trackPageView({ pageType: 'discussion', pagePath: pathname, discussionId })
        } else if (pathname.startsWith('/votes')) {
            trackPageView({ pageType: 'vote', pagePath: pathname })
        } else if (pathname.startsWith('/profile')) {
            trackPageView({ pageType: 'profile', pagePath: pathname })
        } else {
            trackPageView({ pageType: 'other', pagePath: pathname })
        }
    }, [pathname, searchParams])

    return null // UI 없음
}

'use client'

/**
 * components/issue/ViewCounter.tsx
 *
 * [조회수 카운터]
 *
 * 상세 페이지에 삽입되는 보이지 않는 클라이언트 컴포넌트.
 * 마운트 시 한 번 지정된 endpoint로 POST 요청을 보내 조회수를 증가시킵니다.
 */

import { useEffect } from 'react'

interface ViewCounterProps {
    endpoint: string
}

export default function ViewCounter({ endpoint }: ViewCounterProps) {
    useEffect(() => {
        fetch(endpoint, { method: 'POST' }).catch(() => {
            // 조회수 업데이트 실패는 무시 (UX에 영향 없음)
        })
    }, [endpoint])

    return null
}

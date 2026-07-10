/**
 * hooks/usePendingAction.ts
 *
 * 마운트 시 한 번, sessionStorage에 저장된 임시 액션이 이 컴포넌트가 처리해야 할
 * 것인지 확인하고 맞으면 소비(삭제) 후 자동 실행한다.
 */

import { useEffect, useRef } from 'react'
import { peekPendingAction, clearPendingAction, type PendingAction } from '@/lib/pendingAction'

export function usePendingAction<T extends PendingAction['type']>(
    type: T,
    matches: (action: Extract<PendingAction, { type: T }>) => boolean,
    execute: (action: Extract<PendingAction, { type: T }>) => void,
    ready: boolean
) {
    const consumedRef = useRef(false)

    useEffect(() => {
        if (!ready || consumedRef.current) return
        consumedRef.current = true

        const pending = peekPendingAction()
        if (!pending || pending.type !== type) return
        const action = pending as unknown as Extract<PendingAction, { type: T }>
        if (!matches(action)) return

        clearPendingAction()
        execute(action)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready])
}

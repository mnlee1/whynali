/**
 * lib/pendingAction.ts
 *
 * 비로그인 상태에서 시도한 투표/댓글/반응을 로그인 완료 후 자동 실행하기 위한
 * sessionStorage 기반 임시저장 유틸. 로그인 페이지 왕복(같은 탭) 동안만 유지된다.
 */

import type { ReactionType } from '@/types'

export type PendingAction =
    | { type: 'vote'; issueId: string; voteId: string; choiceId: string }
    | { type: 'reaction'; issueId: string; reactionType: ReactionType }
    | { type: 'comment'; issueId?: string; discussionTopicId?: string; parentId?: string | null; text: string }

type StoredPendingAction = PendingAction & { savedAt: number }

const STORAGE_KEY = 'whynali:pendingAction'
const TTL_MS = 10 * 60 * 1000

export function savePendingAction(action: PendingAction) {
    try {
        const stored: StoredPendingAction = { ...action, savedAt: Date.now() }
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
    } catch {
        // sessionStorage 접근 불가 환경(프라이빗 모드 등)에서는 임시저장을 건너뛴다
    }
}

export function peekPendingAction(): StoredPendingAction | null {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw) as StoredPendingAction
        if (!parsed?.type || !parsed.savedAt || Date.now() - parsed.savedAt > TTL_MS) {
            sessionStorage.removeItem(STORAGE_KEY)
            return null
        }
        return parsed
    } catch {
        return null
    }
}

export function clearPendingAction() {
    try {
        sessionStorage.removeItem(STORAGE_KEY)
    } catch {
        // no-op
    }
}

export function goToLogin() {
    const currentPath = window.location.pathname
    window.location.href = `/login?next=${encodeURIComponent(currentPath)}`
}

export function goToLoginWithPendingAction(action: PendingAction) {
    savePendingAction(action)
    goToLogin()
}

/**
 * lib/loginModalStore.ts
 *
 * 헤더 진입점 전용 로그인 오버레이 모달의 열림 상태를 앱 전역에서 공유하기 위한
 * 최소 pub-sub 스토어. 투표/댓글/반응 등 기존 로그인 유도 플로우(LoginPromptModal +
 * lib/pendingAction.ts)는 그대로 풀페이지 /login으로 이동하며, 이 스토어와는 무관하다.
 */

type LoginModalState = { isOpen: boolean; next: string }
type Listener = (state: LoginModalState) => void

let state: LoginModalState = { isOpen: false, next: '/' }
const listeners = new Set<Listener>()

function emit() {
    listeners.forEach((listener) => listener(state))
}

export function openLoginModal(next?: string) {
    state = { isOpen: true, next: next ?? window.location.pathname }
    emit()
}

export function closeLoginModal() {
    state = { ...state, isOpen: false }
    emit()
}

export function subscribeLoginModal(listener: Listener): () => void {
    listeners.add(listener)
    listener(state)
    return () => listeners.delete(listener)
}

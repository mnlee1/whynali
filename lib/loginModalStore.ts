/**
 * lib/loginModalStore.ts
 *
 * 앱 전역 로그인 오버레이 모달의 열림 상태를 공유하기 위한 최소 pub-sub 스토어.
 * 헤더 진입점뿐 아니라 투표/댓글/반응/북마크 등 로그인 필요 액션 전부가
 * savePendingAction(lib/pendingAction.ts) + openLoginModal() 조합으로 이 모달을 띄운다.
 */

type LoginModalState = { isOpen: boolean; next: string; error: string | null }
type Listener = (state: LoginModalState) => void

let state: LoginModalState = { isOpen: false, next: '/', error: null }
const listeners = new Set<Listener>()

function emit() {
    listeners.forEach((listener) => listener(state))
}

export function openLoginModal(next?: string, error?: string | null) {
    state = { isOpen: true, next: next ?? window.location.pathname, error: error ?? null }
    emit()
}

export function closeLoginModal() {
    state = { ...state, isOpen: false, error: null }
    emit()
}

export function subscribeLoginModal(listener: Listener): () => void {
    listeners.add(listener)
    listener(state)
    return () => listeners.delete(listener)
}

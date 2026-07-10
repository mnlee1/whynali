/**
 * components/common/LoginPromptModal.tsx
 *
 * 비로그인 사용자가 투표/댓글/반응을 시도했을 때 confirm() 대신 띄우는 인라인 모달.
 * "로그인하기" 선택 시 호출부에서 goToLoginWithPendingAction으로 임시저장 후 이동한다.
 */

'use client'

interface LoginPromptModalProps {
    isOpen: boolean
    description: string
    onClose: () => void
    onConfirm: () => void
}

export default function LoginPromptModal({ isOpen, description, onClose, onConfirm }: LoginPromptModalProps) {
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
                <div className="px-6 pt-6 pb-4">
                    <h2 className="text-base font-bold text-content-primary mb-1.5">로그인이 필요해요</h2>
                    <p className="text-sm text-content-secondary">{description}</p>
                </div>
                <div className="flex border-t border-border">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 text-sm font-medium text-content-secondary hover:bg-surface-subtle transition-colors"
                    >
                        취소
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 py-3 text-sm font-bold text-primary border-l border-border hover:bg-primary-light/20 transition-colors"
                    >
                        로그인하기
                    </button>
                </div>
            </div>
        </div>
    )
}

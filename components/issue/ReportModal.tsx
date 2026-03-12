/**
 * components/issue/ReportModal.tsx
 *
 * 댓글 신고 전체화면 모달
 * - 신고 대상 정보 (작성자 마스킹, 댓글 내용)
 */

'use client'

interface ReportModalProps {
    isOpen: boolean
    onClose: () => void
    comment: {
        id: string
        body: string
        authorNickname: string
    }
    onReport: (commentId: string, reason: string) => void
}

function maskNickname(nickname: string): string {
    if (nickname.length <= 4) return nickname
    return nickname.slice(0, 4) + '****'
}

function truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text
    return text.slice(0, maxLength) + '...'
}

export default function ReportModal({ isOpen, onClose, comment, onReport }: ReportModalProps) {
    if (!isOpen) return null

    const handleSubmit = () => {
        onReport(comment.id, '기타')
        onClose()
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                {/* 헤더 */}
                <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-gray-900">신고하기</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                        aria-label="닫기"
                    >
                        ×
                    </button>
                </div>

                {/* 신고 대상 정보 */}
                <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 space-y-2">
                    <div className="flex items-baseline gap-2">
                        <span className="text-xs text-gray-500 w-10 shrink-0">작성자</span>
                        <span className="text-sm text-gray-700">{maskNickname(comment.authorNickname)}</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-xs text-gray-500 w-10 shrink-0">내용</span>
                        <span className="text-sm text-gray-700 truncate">{truncateText(comment.body, 50)}</span>
                    </div>
                </div>

                {/* 하단 버튼 */}
                <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4">
                    <button
                        onClick={handleSubmit}
                        className="w-full py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors"
                    >
                        신고하기
                    </button>
                </div>
            </div>
        </div>
    )
}

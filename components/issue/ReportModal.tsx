/**
 * components/issue/ReportModal.tsx
 *
 * 댓글 신고 전체화면 모달
 * - 신고 대상 정보 (작성자 마스킹, 댓글 내용)
 * - 라디오 버튼 사유 선택
 */

'use client'

import { useState } from 'react'

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

type ReportOption = {
    id: string
    label: string
    dbValue: string
}

const REPORT_OPTIONS: ReportOption[] = [
    { id: 'hate', label: '혐오/차별적/생명경시/욕설 표현입니다.', dbValue: '욕설/혐오' },
    { id: 'spam', label: '스팸홍보/도배글입니다', dbValue: '스팸/광고' },
    { id: 'obscene', label: '음란물입니다.', dbValue: '기타' },
    { id: 'illegal', label: '불법정보를 포함하고 있습니다.', dbValue: '허위정보' },
    { id: 'youth', label: '청소년에게 유해한 내용입니다.', dbValue: '기타' },
    { id: 'privacy', label: '개인정보 노출 게시물입니다.', dbValue: '기타' },
    { id: 'offensive', label: '불쾌한 표현이 있습니다.', dbValue: '기타' },
]

function maskNickname(nickname: string): string {
    if (nickname.length <= 4) return nickname
    return nickname.slice(0, 4) + '****'
}

function truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text
    return text.slice(0, maxLength) + '...'
}

export default function ReportModal({ isOpen, onClose, comment, onReport }: ReportModalProps) {
    const [selectedOption, setSelectedOption] = useState<string | null>(null)

    if (!isOpen) return null

    const handleSubmit = () => {
        if (!selectedOption) return
        const option = REPORT_OPTIONS.find((o) => o.id === selectedOption)
        if (!option) return
        onReport(comment.id, option.dbValue)
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

                {/* 사유 선택 */}
                <div className="px-6 py-4">
                    <p className="text-sm font-semibold text-gray-800 mb-3">사유선택</p>
                    <div className="space-y-2">
                        {REPORT_OPTIONS.map((option) => (
                            <div
                                key={option.id}
                                className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors ${
                                    selectedOption === option.id
                                        ? 'border-green-500'
                                        : 'border-gray-200'
                                }`}
                                onClick={() => setSelectedOption(option.id)}
                            >
                                <input
                                    type="radio"
                                    id={`report-${option.id}`}
                                    name="report-reason"
                                    value={option.id}
                                    checked={selectedOption === option.id}
                                    onChange={() => setSelectedOption(option.id)}
                                    className="w-4 h-4 text-green-600 focus:ring-green-500 cursor-pointer"
                                />
                                <label htmlFor={`report-${option.id}`} className="flex-1 text-sm text-gray-700 cursor-pointer">
                                    {option.label}
                                </label>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 하단 버튼 */}
                <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4">
                    <button
                        onClick={handleSubmit}
                        disabled={!selectedOption}
                        className="w-full py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-green-600 transition-colors"
                    >
                        신고하기
                    </button>
                </div>
            </div>
        </div>
    )
}

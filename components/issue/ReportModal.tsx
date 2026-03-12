/**
 * components/issue/ReportModal.tsx
 *
 * 댓글 신고 전체화면 모달
 * - 신고 대상 정보 (작성자 마스킹, 댓글 내용)
 * - 라디오 버튼 사유 선택 + 아코디언 상세 설명
 * - 추가 정보 필요 항목은 안내만
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
    details?: string[]
}

const REPORT_OPTIONS: ReportOption[] = [
    {
        id: 'hate',
        label: '혐오/차별적/생명경시/욕설 표현입니다.',
        dbValue: '욕설/혐오',
        details: [
            '직·간접적인 욕설을 사용하여 타인에게 모욕감을 주는 내용',
            '생명을 경시하거나 비하하는 내용',
            '계층/지역/종교/성별 등을 혐오하거나 비하하는 표현',
            '신체/외모/취향 등을 경멸하는 표현',
        ],
    },
    { id: 'spam', label: '스팸홍보/도배글입니다', dbValue: '스팸/광고' },
    { id: 'obscene', label: '음란물입니다.', dbValue: '기타' },
    { id: 'illegal', label: '불법정보를 포함하고 있습니다.', dbValue: '허위정보' },
    { id: 'youth', label: '청소년에게 유해한 내용입니다.', dbValue: '기타' },
    { id: 'privacy', label: '개인정보 노출 게시물입니다.', dbValue: '기타' },
    { id: 'offensive', label: '불쾌한 표현이 있습니다.', dbValue: '기타' },
]

type ExtraInfoOption = {
    id: string
    label: string
    guide: string
}

const EXTRA_INFO_OPTIONS: ExtraInfoOption[] = [
    {
        id: 'defamation',
        label: '명예훼손/사생활침해 게시물입니다.',
        guide: '명예훼손이나 사생활 침해는 법적 증거 자료가 필요합니다. 한국인터넷자율정책기구(KISO)나 방송통신심의위원회를 통해 별도로 신고해주세요.',
    },
    {
        id: 'illegal-recording',
        label: '불법촬영물 등이 포함되어 있습니다.',
        guide: '불법촬영물은 경찰청 사이버안전국 또는 디지털성범죄피해자지원센터(https://www.d4u.or.kr)를 통해 신고해주세요.',
    },
    {
        id: 'election-misinfo',
        label: '선거 관련 허위정보 등이 포함되어 있습니다.',
        guide: '선거 관련 허위정보는 중앙선거관리위원회(https://www.nec.go.kr)를 통해 신고해주세요.',
    },
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
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
    const [expandedExtraIds, setExpandedExtraIds] = useState<Set<string>>(new Set())

    if (!isOpen) return null

    const handleToggleExpand = (id: string) => {
        setExpandedIds((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const handleToggleExtraExpand = (id: string) => {
        setExpandedExtraIds((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

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
                <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
                    <p className="text-xs text-gray-500 mb-1">작성자</p>
                    <p className="text-sm font-medium text-gray-700 mb-3">{maskNickname(comment.authorNickname)}</p>
                    <p className="text-xs text-gray-500 mb-1">내용</p>
                    <p className="text-sm text-gray-700">{truncateText(comment.body, 50)}</p>
                </div>

                {/* 사유 선택 */}
                <div className="px-6 py-4">
                    <p className="text-sm font-semibold text-gray-800 mb-3">신고 사유를 선택해주세요</p>
                    <div className="space-y-2">
                        {REPORT_OPTIONS.map((option) => (
                            <div key={option.id} className="border border-gray-200 rounded-lg overflow-hidden">
                                <div className="flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors">
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
                                    {option.details && (
                                        <button
                                            onClick={() => handleToggleExpand(option.id)}
                                            className="text-gray-400 hover:text-gray-600 text-sm"
                                            aria-label="상세보기"
                                        >
                                            {expandedIds.has(option.id) ? '▲' : '▼'}
                                        </button>
                                    )}
                                </div>
                                {option.details && expandedIds.has(option.id) && (
                                    <div className="px-3 pb-3 pt-1 bg-gray-50 border-t border-gray-100">
                                        <ul className="space-y-1">
                                            {option.details.map((detail, idx) => (
                                                <li key={idx} className="text-xs text-gray-600 pl-3 before:content-['•'] before:mr-2">
                                                    {detail}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* 추가 정보 필요 항목 */}
                <div className="px-6 py-4 bg-yellow-50 border-t border-yellow-100">
                    <p className="text-xs text-gray-600 mb-3">
                        아래 사유는 추가 정보 입력이 필요합니다. 사유를 클릭하여 안내에 따라 별도의 접수를 진행해주세요.
                    </p>
                    <div className="space-y-2">
                        {EXTRA_INFO_OPTIONS.map((option) => (
                            <div key={option.id} className="border border-yellow-200 rounded-lg overflow-hidden bg-white">
                                <button
                                    onClick={() => handleToggleExtraExpand(option.id)}
                                    className="w-full flex items-center justify-between p-3 text-left hover:bg-yellow-50 transition-colors"
                                >
                                    <span className="text-sm text-gray-700">{option.label}</span>
                                    <span className="text-gray-400 text-sm">
                                        {expandedExtraIds.has(option.id) ? '▲' : '▼'}
                                    </span>
                                </button>
                                {expandedExtraIds.has(option.id) && (
                                    <div className="px-3 pb-3 pt-1 bg-yellow-50 border-t border-yellow-100">
                                        <p className="text-xs text-gray-600">{option.guide}</p>
                                    </div>
                                )}
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

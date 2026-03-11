'use client'

import { useState, useEffect } from 'react'

const STORAGE_KEY = 'safety_bot_enabled'

interface SafetyBotSettingModalProps {
    onClose: () => void
    onConfirm: (enabled: boolean) => void
}

export default function SafetyBotSettingModal({ onClose, onConfirm }: SafetyBotSettingModalProps) {
    const [enabled, setEnabled] = useState(true)

    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY)
        setEnabled(stored !== 'false')
    }, [])

    const title = enabled ? '세이프티봇 활성화 중' : '세이프티봇 비활성화 중'
    const description = enabled
        ? '욕설, 비하, 혐오 표현이 포함된 댓글을 자동으로 필터링해 쾌적한 댓글 환경을 유지해드려요.'
        : '세이프티봇이 꺼져 있어요. 필터링 없이 모든 댓글이 그대로 표시되며, 불쾌한 표현이 포함될 수 있어요.'

    const handleConfirm = () => {
        const current = localStorage.getItem(STORAGE_KEY) !== 'false'
        if (enabled !== current) {
            localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false')
            onConfirm(enabled)
        }
        onClose()
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-xl shadow-xl w-80 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* 헤더 */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                    <span className="text-sm font-semibold text-gray-800">{title}</span>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 text-lg leading-none"
                        aria-label="닫기"
                    >
                        ✕
                    </button>
                </div>

                {/* 본문 */}
                <div className="px-5 py-5 space-y-5">
                    <p className="text-sm text-gray-600 leading-relaxed">{description}</p>

                    {/* 스위치 버튼 */}
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">세이프티봇 설정</span>
                        <button
                            role="switch"
                            aria-checked={enabled}
                            onClick={() => setEnabled((v) => !v)}
                            className={[
                                'px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors',
                                enabled
                                    ? 'bg-neutral-900 text-white border-neutral-900'
                                    : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400',
                            ].join(' ')}
                        >
                            {enabled ? 'ON' : 'OFF'}
                        </button>
                    </div>
                </div>

                {/* 푸터 */}
                <div className="flex justify-end px-5 py-4 border-t border-gray-100 bg-gray-50">
                    <button
                        onClick={handleConfirm}
                        className="text-sm px-5 py-2 bg-neutral-900 text-white rounded-lg hover:bg-neutral-700 transition-colors font-medium"
                    >
                        확인
                    </button>
                </div>
            </div>
        </div>
    )
}

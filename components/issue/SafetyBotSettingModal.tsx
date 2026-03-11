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
                    <span className="text-sm font-semibold text-gray-800">세이프티봇 설정</span>
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
                    <p className="text-sm text-gray-600 leading-relaxed">
                        욕설, 비하 표현 등의 댓글을<br />
                        자동으로 가려드려요.
                    </p>

                    {/* 토글 */}
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">세이프티봇</span>
                        <button
                            role="switch"
                            aria-checked={enabled}
                            onClick={() => setEnabled((v) => !v)}
                            className={[
                                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none',
                                enabled ? 'bg-neutral-800' : 'bg-gray-300',
                            ].join(' ')}
                        >
                            <span
                                className={[
                                    'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
                                    enabled ? 'translate-x-6' : 'translate-x-1',
                                ].join(' ')}
                            />
                            <span className="sr-only">{enabled ? 'ON' : 'OFF'}</span>
                        </button>
                        <span className={['text-xs font-semibold', enabled ? 'text-neutral-800' : 'text-gray-400'].join(' ')}>
                            {enabled ? 'ON' : 'OFF'}
                        </span>
                    </div>
                </div>

                {/* 푸터 */}
                <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 bg-gray-50">
                    <button
                        onClick={onClose}
                        className="text-sm px-4 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                        취소
                    </button>
                    <button
                        onClick={handleConfirm}
                        className="text-sm px-4 py-2 bg-neutral-900 text-white rounded-lg hover:bg-neutral-700 transition-colors font-medium"
                    >
                        확인
                    </button>
                </div>
            </div>
        </div>
    )
}

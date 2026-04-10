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
                className="bg-white rounded-2xl shadow-xl w-80 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* 닫기 버튼 */}
                <div className="flex justify-end px-4 pt-4">
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                        aria-label="닫기"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* 본문 — 중앙 정렬 */}
                <div className="px-6 pb-6 flex flex-col items-center text-center gap-3">
                    {/* 아이콘 */}
                    <div className={[
                        'w-14 h-14 rounded-full flex items-center justify-center transition-colors',
                        enabled ? 'bg-green-50' : 'bg-gray-100',
                    ].join(' ')}>
                        <svg xmlns="http://www.w3.org/2000/svg" className={['w-7 h-7', enabled ? 'text-green-500' : 'text-gray-400'].join(' ')} fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                        </svg>
                    </div>

                    {/* 타이틀 */}
                    <p className="text-base font-bold text-gray-800">
                        세이프티봇 {enabled ? '활성화' : '비활성화'}
                    </p>

                    {/* 설명 */}
                    <p className="text-sm text-gray-500 leading-relaxed">
                        {enabled ? (
                            <>악성 댓글을 자동으로 필터링하여<br />안전한 환경을 제공합니다.</>
                        ) : (
                            <>세이프티봇이 꺼져 있어요.<br />모든 댓글이 표시되니 주의해 주세요.</>
                        )}
                    </p>

                    {/* 토글 */}
                    <div className="w-full flex items-center justify-between mt-1 bg-gray-50 rounded-xl px-4 py-3">
                        <span className="text-sm font-medium text-gray-700">세이프티봇</span>
                        <button
                            role="switch"
                            aria-checked={enabled}
                            onClick={() => setEnabled((v) => !v)}
                            className={[
                                'relative flex items-center w-16 h-8 rounded-full transition-colors duration-200 focus:outline-none',
                                enabled ? 'bg-emerald-400' : 'bg-gray-200',
                            ].join(' ')}
                        >
                            <span className={[
                                'absolute text-[10px] font-bold transition-all duration-200 select-none',
                                enabled ? 'left-2.5 text-white' : 'right-2 text-gray-400',
                            ].join(' ')}>
                                {enabled ? 'ON' : 'OFF'}
                            </span>
                            <span className={[
                                'absolute w-6 h-6 rounded-full bg-white shadow-md transition-transform duration-200',
                                enabled ? 'translate-x-9' : 'translate-x-1',
                            ].join(' ')} />
                        </button>
                    </div>
                </div>

                {/* 푸터 */}
                <div className="px-6 pb-6">
                    <button
                        onClick={handleConfirm}
                        className="w-full btn-primary btn-md"
                    >
                        확인
                    </button>
                </div>
            </div>
        </div>
    )
}

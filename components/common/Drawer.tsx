'use client'

/**
 * components/common/Drawer.tsx
 *
 * 범용 Drawer 프리미티브.
 * - lg(1024px) 이상: 우측 슬라이드 패널 (기본 440px, "넓게 보기" 토글로 720px)
 * - lg 미만: 풀스크린 전환
 * z-[55] 사용 — 헤더(z-50)보다는 위, LoginPromptModal/ReportModal 등 기존 모달(z-[60])보다는
 * 아래로 둬서 그 모달들이 이 위에 겹쳐 뜰 수 있게 함.
 */

import { useState, useEffect } from 'react'
import { X, Maximize2, Minimize2 } from 'lucide-react'

interface Props {
    isOpen: boolean
    onClose: () => void
    title?: string
    children: React.ReactNode
}

export default function Drawer({ isOpen, onClose, title, children }: Props) {
    const [wide, setWide] = useState(false)

    useEffect(() => {
        if (!isOpen) return
        const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        document.addEventListener('keydown', onKeyDown)
        document.body.style.overflow = 'hidden'
        return () => {
            document.removeEventListener('keydown', onKeyDown)
            document.body.style.overflow = ''
        }
    }, [isOpen, onClose])

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-[55]">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div
                className={`absolute right-0 top-0 bottom-0 w-full bg-surface shadow-2xl flex flex-col
                    lg:w-[440px] ${wide ? 'lg:w-[720px]' : ''} transition-[width] duration-200`}
            >
                <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                    <h2 className="text-sm font-bold text-content-primary truncate pr-2">{title}</h2>
                    <div className="flex items-center gap-1 shrink-0">
                        <button
                            type="button"
                            onClick={() => setWide((v) => !v)}
                            aria-label={wide ? '좁게 보기' : '넓게 보기'}
                            className="hidden lg:flex w-8 h-8 rounded-full items-center justify-center text-content-secondary hover:bg-surface-muted transition-colors"
                        >
                            {wide ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="닫기"
                            className="w-8 h-8 rounded-full flex items-center justify-center text-content-secondary hover:bg-surface-muted transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {children}
                </div>
            </div>
        </div>
    )
}

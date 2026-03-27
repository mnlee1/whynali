/** components/common/Tooltip.tsx — 정보 툴팁 (PC: hover, 모바일: 클릭 토글 + 바깥 클릭 닫기) */

'use client'

import { useState, useRef, useEffect } from 'react'

interface TooltipProps {
    text: string
    label: string
    align?: 'right' | 'left'
    width?: string
}

export default function Tooltip({ text, label, align = 'right', width = 'w-max max-w-[240px]' }: TooltipProps) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) return
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [open])

    return (
        <div
            ref={ref}
            className="relative group/tooltip flex items-center gap-1 cursor-default select-none"
            onClick={() => setOpen((v) => !v)}
        >
            <span className="text-xs text-content-muted">{label}</span>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-content-disabled" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <div className={[
                `absolute top-6 ${align === 'right' ? 'right-0' : 'left-0'} ${width}`,
                'bg-gray-900 text-white text-xs rounded-xl z-20 leading-relaxed shadow-lg',
                'transition-opacity',
                open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
                'md:pointer-events-none md:opacity-0 md:group-hover/tooltip:opacity-100',
            ].join(' ')}>
                <p className="px-3 py-2 pr-7 md:pr-3 text-left">{text}</p>
                <button
                    onClick={(e) => { e.stopPropagation(); setOpen(false) }}
                    className="md:hidden absolute top-2 right-2 text-white/50 hover:text-white"
                    aria-label="닫기"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                </button>
            </div>
        </div>
    )
}

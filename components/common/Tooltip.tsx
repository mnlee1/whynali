/** components/common/Tooltip.tsx — 정보 툴팁 (PC: hover, 모바일: 클릭 토글 + 바깥 클릭 닫기) */

'use client'

import { useState, useRef, useEffect } from 'react'
import { CircleAlert, X } from 'lucide-react'

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
            <span className="text-xs text-content-secondary">{label}</span>
            <CircleAlert className="w-3.5 h-3.5 text-content-secondary" />
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
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    )
}

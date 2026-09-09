/**
 * components/common/SortDropdown.tsx
 *
 * [정렬 드롭다운 공통 컴포넌트]
 *
 * 브라우저 기본 select 대신 디자인 가이드에 맞춘 커스텀 드롭다운.
 * 선택된 옵션에 체크 아이콘을 표시합니다.
 *
 * 사용 예시:
 *   <SortDropdown value={sort} options={[{ value: 'latest', label: '최신순' }, { value: 'heat', label: '인기순' }]} onChange={setSort} />
 */

'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'

interface SortDropdownOption<T extends string> {
    value: T
    label: string
}

interface SortDropdownProps<T extends string> {
    value: T
    options: readonly SortDropdownOption<T>[]
    onChange: (value: T) => void
}

export default function SortDropdown<T extends string>({ value, options, onChange }: SortDropdownProps<T>) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const handleOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        if (open) {
            setTimeout(() => document.addEventListener('mousedown', handleOutside), 0)
        }
        return () => document.removeEventListener('mousedown', handleOutside)
    }, [open])

    const selected = options.find(o => o.value === value)

    return (
        <div className="relative shrink-0" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                aria-expanded={open}
                className="flex items-center gap-1 text-xs sm:text-sm font-medium text-content-secondary bg-surface border border-border rounded-full px-3 py-1.5 hover:border-border-strong transition-colors"
            >
                {selected?.label}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} strokeWidth={2} />
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-1.5 z-20 bg-surface border border-border rounded-xl shadow-card py-1 w-32 overflow-hidden">
                    {options.map((opt) => {
                        const isSelected = opt.value === value
                        return (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => { onChange(opt.value); setOpen(false) }}
                                className={[
                                    'w-full flex items-center justify-between px-3 py-2 text-sm text-left transition-colors',
                                    isSelected ? 'text-primary font-semibold bg-primary/5' : 'text-content-secondary hover:bg-surface-subtle',
                                ].join(' ')}
                            >
                                {opt.label}
                                {isSelected && <Check className="w-4 h-4 shrink-0" strokeWidth={2.5} />}
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

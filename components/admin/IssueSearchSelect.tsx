'use client'

import { useState, useRef, useEffect } from 'react'

interface Issue {
    id: string
    title: string
}

interface Props {
    issues: Issue[]
    value: Issue | null
    onChange: (issue: Issue | null) => void
    loading?: boolean
    placeholder?: string
}

export default function IssueSearchSelect({ issues, value, onChange, loading, placeholder = '이슈를 선택하세요' }: Props) {
    const [query, setQuery] = useState('')
    const [open, setOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    const filtered = query.trim()
        ? issues.filter((i) => i.title.toLowerCase().includes(query.toLowerCase()))
        : issues

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false)
                setQuery('')
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    function handleSelect(issue: Issue) {
        onChange(issue)
        setQuery('')
        setOpen(false)
    }

    function handleInputClick() {
        setOpen(true)
        inputRef.current?.select()
    }

    if (loading) {
        return <p className="text-sm text-content-muted">이슈 목록 불러오는 중...</p>
    }

    return (
        <div ref={containerRef} className="relative">
            <div className="relative">
                <input
                    ref={inputRef}
                    type="text"
                    value={open ? query : (value?.title ?? '')}
                    onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
                    onClick={handleInputClick}
                    onFocus={() => setOpen(true)}
                    placeholder={placeholder}
                    className="w-full pl-3 pr-8 py-2 text-sm border border-border rounded-xl focus:outline-none focus:border-primary bg-surface"
                />
                <svg
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                >
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
            </div>

            {open && (
                <ul className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto border border-border rounded-xl bg-surface shadow-lg">
                    {filtered.length === 0 ? (
                        <li className="px-3 py-2 text-sm text-content-muted">검색 결과 없음</li>
                    ) : (
                        filtered.map((issue) => (
                            <li
                                key={issue.id}
                                onMouseDown={() => handleSelect(issue)}
                                className={`px-3 py-2 text-sm cursor-pointer hover:bg-surface-subtle ${value?.id === issue.id ? 'bg-primary-light/30 text-primary-dark font-medium' : 'text-content-primary'}`}
                            >
                                {issue.title}
                            </li>
                        ))
                    )}
                </ul>
            )}
        </div>
    )
}

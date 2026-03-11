'use client'

import { Fragment } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CATEGORY_LABELS } from '@/lib/config/categories'

interface NavProps {
    mobile?: boolean
}

export default function Nav({ mobile = false }: NavProps) {
    const pathname = usePathname()

    const categories = [
        { name: CATEGORY_LABELS['연예'], href: '/entertain', id: '연예' },
        { name: CATEGORY_LABELS['스포츠'], href: '/sports', id: '스포츠' },
        { name: CATEGORY_LABELS['정치'], href: '/politics', id: '정치' },
        { name: CATEGORY_LABELS['사회'], href: '/society', id: '사회' },
        { name: CATEGORY_LABELS['경제'], href: '/economy', id: '경제' },
        { name: CATEGORY_LABELS['IT과학'], href: '/it-science', id: 'IT과학' },
        { name: CATEGORY_LABELS['생활문화'], href: '/lifestyle', id: '생활문화' },
        { name: CATEGORY_LABELS['세계'], href: '/world', id: '세계' },
        { name: '커뮤니티', href: '/community', id: 'community' },
    ]

    if (mobile) {
        return (
            <>
                {categories.map((cat) => {
                    const isActive = pathname === cat.href || pathname.startsWith(cat.href + '/')
                    return (
                        <Link
                            key={cat.href}
                            href={cat.href}
                            className={`px-3.5 py-1.5 text-sm rounded-full whitespace-nowrap border transition-colors ${
                                isActive 
                                    ? 'bg-violet-700 text-white border-violet-700 font-semibold' 
                                    : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-300 font-medium'
                            }`}
                        >
                            {cat.name}
                        </Link>
                    )
                })}
            </>
        )
    }

    return (
        <nav className="flex items-center gap-5">
            {categories.map((cat) => {
                const isActive = pathname === cat.href || pathname.startsWith(cat.href + '/')
                return (
                    <Fragment key={cat.href}>
                        {cat.name === '커뮤니티' && (
                            <span className="w-px h-4 bg-neutral-300" />
                        )}
                        <Link
                            href={cat.href}
                            className={`text-sm whitespace-nowrap transition-colors ${
                                isActive 
                                    ? 'text-neutral-900 font-bold' 
                                    : 'text-neutral-600 font-normal hover:text-neutral-900'
                            }`}
                        >
                            {cat.name}
                        </Link>
                    </Fragment>
                )
            })}
        </nav>
    )
}

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
        { name: CATEGORY_LABELS['기술'], href: '/tech', id: '기술' },
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
                            className={`pt-2 pb-2.5 text-sm whitespace-nowrap transition-colors border-b-2 ${
                                isActive
                                    ? 'text-content-primary font-bold border-primary'
                                    : 'text-content-secondary font-normal border-transparent hover:text-content-primary'
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
                            <span className="w-px h-4 bg-border" />
                        )}
                        <Link
                            href={cat.href}
                            className={`text-sm whitespace-nowrap transition-colors ${
                                isActive
                                    ? 'text-primary font-bold'
                                    : 'text-content-secondary font-normal hover:text-content-primary'
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

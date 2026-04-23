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
                        <Fragment key={cat.href}>
                            <Link
                                href={cat.href}
                                className={`pt-2 pb-2.5 text-sm whitespace-nowrap transition-colors border-b-2 ${
                                    isActive
                                        ? 'text-content-primary font-semibold border-primary'
                                        : 'text-content-secondary font-semibold border-transparent hover:text-content-primary'
                                }`}
                            >
                                {cat.name}
                            </Link>
                            {cat.name === '세계' && (
                                <span className="w-px h-4 bg-border -mx-2" />
                            )}
                        </Fragment>
                    )
                })}
            </>
        )
    }

    return (
        <nav className="flex items-center gap-5 h-full">
            {categories.map((cat) => {
                const isActive = pathname === cat.href || pathname.startsWith(cat.href + '/')
                return (
                    <Fragment key={cat.href}>
                        <Link
                            href={cat.href}
                            className={`flex items-center h-full text-sm whitespace-nowrap transition-colors border-b-2 ${
                                isActive
                                    ? 'text-content-primary font-semibold border-primary'
                                    : 'text-content-secondary font-semibold border-transparent hover:text-content-primary'
                            }`}
                        >
                            {cat.name}
                        </Link>
                        {cat.name === '세계' && (
                            <span className="w-px h-4 bg-border -mx-2" />
                        )}
                    </Fragment>
                )
            })}
        </nav>
    )
}

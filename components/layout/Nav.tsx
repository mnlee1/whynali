'use client'

import { Fragment } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavProps {
    mobile?: boolean
    onNavigate?: () => void
}

export default function Nav({ mobile = false, onNavigate }: NavProps) {
    const pathname = usePathname()

    const categories = [
        { name: '연예', href: '/entertain' },
        { name: '스포츠', href: '/sports' },
        { name: '정치', href: '/politics' },
        { name: '사회', href: '/society' },
        { name: '기술', href: '/tech' },
        { name: '커뮤니티', href: '/community' },
    ]

    if (mobile) {
        return (
            <nav className="flex flex-col gap-1">
                {categories.map((cat) => {
                    const isActive = pathname === cat.href || pathname.startsWith(cat.href + '/')
                    return (
                        <Link
                            key={cat.href}
                            href={cat.href}
                            onClick={onNavigate}
                            className={`text-base py-2 hover:text-neutral-900 ${isActive ? 'text-neutral-900 font-bold' : 'text-neutral-700 font-normal'}`}
                        >
                            {cat.name}
                        </Link>
                    )
                })}
            </nav>
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
                            className={`text-sm hover:text-neutral-900 whitespace-nowrap ${isActive ? 'text-neutral-900 font-bold' : 'text-neutral-600 font-normal'}`}
                        >
                            {cat.name}
                        </Link>
                    </Fragment>
                )
            })}
        </nav>
    )
}

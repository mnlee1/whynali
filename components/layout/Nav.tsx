'use client'

import { Fragment } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavProps {
    mobile?: boolean
}

export default function Nav({ mobile = false }: NavProps) {
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

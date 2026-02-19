import Link from 'next/link'

interface NavProps {
    mobile?: boolean
    onNavigate?: () => void
}

export default function Nav({ mobile = false, onNavigate }: NavProps) {
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
            <nav className="flex flex-col gap-3">
                {categories.map((cat) => (
                    <Link
                        key={cat.href}
                        href={cat.href}
                        onClick={onNavigate}
                        className="text-base py-2 hover:text-blue-600 active:text-blue-600"
                    >
                        {cat.name}
                    </Link>
                ))}
            </nav>
        )
    }

    return (
        <nav className="flex gap-4 lg:gap-6">
            {categories.map((cat) => (
                <Link
                    key={cat.href}
                    href={cat.href}
                    className="text-sm hover:text-blue-600 whitespace-nowrap"
                >
                    {cat.name}
                </Link>
            ))}
        </nav>
    )
}

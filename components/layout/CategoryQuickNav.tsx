/**
 * components/layout/CategoryQuickNav.tsx
 *
 * [카테고리 퀵 네비게이션 블록]
 *
 * 메인화면에서 카테고리 8개를 바로 탐색할 수 있는 블록입니다.
 * 헤더 nav와 달리 메인화면 본문에 카드 형태로 배치되어, 시각적으로 카테고리를 인지하고
 * 원하는 카테고리 페이지로 바로 이동할 수 있습니다.
 */

import Link from 'next/link'

// 카테고리 메타 정보 (경로, 라벨, 아이콘 기호)
const CATEGORIES = [
    { href: '/entertain', label: '연예', icon: '★', desc: '연예인 이슈' },
    { href: '/sports', label: '스포츠', icon: '◆', desc: '스포츠 논란' },
    { href: '/politics', label: '정치', icon: '◎', desc: '정치 이슈' },
    { href: '/society', label: '사회', icon: '◉', desc: '사회 이슈' },
    { href: '/economy', label: '경제', icon: '₩', desc: '경제 이슈' },
    { href: '/tech', label: '기술', icon: '▣', desc: 'IT/과학' },
    { href: '/world', label: '세계', icon: '◐', desc: '해외 뉴스' },
]

export default function CategoryQuickNav() {
    return (
        <section>
            <h2 className="text-base font-bold text-content-primary mb-3">카테고리</h2>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                {CATEGORIES.map((cat) => (
                    <Link key={cat.href} href={cat.href}>
                        <div className="card-hover flex flex-col items-center justify-center gap-1.5 p-3 transition-all text-center group">
                            <span className="text-lg text-content-muted group-hover:text-primary transition-colors">
                                {cat.icon}
                            </span>
                            <span className="text-sm font-semibold text-content-primary">
                                {cat.label}
                            </span>
                            <span className="hidden md:block text-xs text-content-muted">
                                {cat.desc}
                            </span>
                        </div>
                    </Link>
                ))}
            </div>
        </section>
    )
}

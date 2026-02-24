/**
 * components/layout/CategoryQuickNav.tsx
 *
 * [카테고리 퀵 네비게이션 블록]
 *
 * 메인화면에서 카테고리(연예/스포츠/정치/사회/기술) 5개를 바로 탐색할 수 있는 블록입니다.
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
    { href: '/tech', label: '기술', icon: '▣', desc: '기술 트렌드' },
]

export default function CategoryQuickNav() {
    return (
        <section>
            <h2 className="text-base font-bold text-neutral-900 mb-3">카테고리</h2>

            <div className="grid grid-cols-5 gap-2">
                {CATEGORIES.map((cat) => (
                    <Link key={cat.href} href={cat.href}>
                        <div className="flex flex-col items-center justify-center gap-1.5 p-3 bg-white border border-neutral-200 rounded-xl hover:border-neutral-300 hover:bg-neutral-50 transition-all text-center group">
                            {/* 아이콘 */}
                            <span className="text-lg text-neutral-400 group-hover:text-neutral-600 transition-colors">
                                {cat.icon}
                            </span>
                            {/* 카테고리명 */}
                            <span className="text-sm font-semibold text-neutral-700">
                                {cat.label}
                            </span>
                            {/* 설명 — md 이상에서만 표시 */}
                            <span className="hidden md:block text-xs text-neutral-400">
                                {cat.desc}
                            </span>
                        </div>
                    </Link>
                ))}
            </div>
        </section>
    )
}

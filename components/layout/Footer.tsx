/**
 * components/layout/Footer.tsx
 *
 * [하단 푸터]
 *
 * 서비스명, 약관/정책 링크 영역. Tailwind만 사용.
 */

import Link from 'next/link'

export default function Footer() {
    return (
        <footer className="border-t border-neutral-200 bg-white mt-auto">
            <div className="container mx-auto px-4 py-6">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-neutral-500">
                    <span className="font-medium text-neutral-700">왜난리</span>
                    <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1">
                        <Link href="/" className="hover:text-neutral-900">
                            홈
                        </Link>
                        <Link href="/community" className="hover:text-neutral-900">
                            커뮤니티
                        </Link>
                        {/* 이용약관·개인정보처리방침은 페이지 준비 후 href 연결 */}
                        <span className="text-neutral-400">이용약관</span>
                        <span className="text-neutral-400">개인정보처리방침</span>
                    </nav>
                </div>
                <p className="mt-3 text-center sm:text-left text-xs text-neutral-400">
                    한국 이슈를 한눈에 파악하고 여론을 확인하세요
                </p>
            </div>
        </footer>
    )
}

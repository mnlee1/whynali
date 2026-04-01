/**
 * app/not-found.tsx
 *
 * [404 페이지 — 존재하지 않는 경로]
 *
 * 사용자가 없는 URL에 접근했을 때 보여지는 페이지입니다.
 * Next.js App Router의 not-found 컨벤션을 따릅니다.
 */

import Link from 'next/link'

export default function NotFound() {
    return (
        <div className="flex flex-col items-center justify-center flex-1 px-4 py-24 text-center">
            <span className="text-7xl font-black tracking-tight bg-gradient-primary bg-clip-text text-transparent">
                404
            </span>
            <h1 className="mt-4 text-xl font-bold text-content-primary">
                페이지를 찾을 수 없어요
            </h1>
            <p className="mt-2 text-sm text-content-secondary max-w-xs">
                주소가 잘못됐거나 삭제된 페이지입니다.
            </p>
            <Link href="/" className="btn btn-md btn-primary mt-8">
                홈으로 돌아가기
            </Link>
        </div>
    )
}

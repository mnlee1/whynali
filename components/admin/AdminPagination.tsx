/**
 * components/admin/AdminPagination.tsx
 *
 * 관리자 페이지 공용 페이지네이션 컴포넌트.
 * 번호형 + 말줄임(…) + 이전/다음 화살표 + 건수 표시.
 */

interface AdminPaginationProps {
    page: number
    totalPages: number
    total: number
    pageSize: number
    onChange: (page: number) => void
    disabled?: boolean
}

export default function AdminPagination({
    page,
    totalPages,
    total,
    pageSize,
    onChange,
    disabled = false,
}: AdminPaginationProps) {
    if (totalPages <= 1) return null

    const range: (number | '…')[] = []
    if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i++) range.push(i)
    } else {
        range.push(1)
        if (page > 3) range.push('…')
        for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
            range.push(i)
        }
        if (page < totalPages - 2) range.push('…')
        range.push(totalPages)
    }

    const from = (page - 1) * pageSize + 1
    const to = Math.min(page * pageSize, total)

    return (
        <div className="flex items-center justify-between mt-4">
            <span className="text-sm text-content-secondary">
                {from}–{to} / 총 {total}개
            </span>
            <div className="flex items-center gap-1">
                <button
                    onClick={() => onChange(page - 1)}
                    disabled={page === 1 || disabled}
                    className="px-2.5 py-1.5 text-sm border border-border rounded-xl disabled:opacity-30 hover:bg-surface-muted"
                >
                    ←
                </button>
                {range.map((p, i) =>
                    p === '…' ? (
                        <span key={`el-${i}`} className="px-2 text-content-muted text-sm">…</span>
                    ) : (
                        <button
                            key={p}
                            onClick={() => onChange(p as number)}
                            disabled={disabled}
                            className={`px-3 py-1.5 text-sm border rounded-xl ${
                                page === p
                                    ? 'bg-primary text-white border-primary'
                                    : 'border-border hover:bg-surface-muted'
                            }`}
                        >
                            {p}
                        </button>
                    )
                )}
                <button
                    onClick={() => onChange(page + 1)}
                    disabled={page === totalPages || disabled}
                    className="px-2.5 py-1.5 text-sm border border-border rounded-xl disabled:opacity-30 hover:bg-surface-muted"
                >
                    →
                </button>
            </div>
        </div>
    )
}

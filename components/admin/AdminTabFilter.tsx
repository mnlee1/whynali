/**
 * components/admin/AdminTabFilter.tsx
 *
 * 관리자 페이지 공용 탭 필터 컴포넌트.
 * 탭 옆에 해당 탭의 아이템 수를 배지로 표시.
 */

interface Tab<T extends string> {
    value: T
    label: string
}

interface AdminTabFilterProps<T extends string> {
    tabs: Tab<T>[]
    active: T
    counts?: Record<string, number>
    onChange: (value: T) => void
}

export default function AdminTabFilter<T extends string>({
    tabs,
    active,
    counts,
    onChange,
}: AdminTabFilterProps<T>) {
    return (
        <div className="flex gap-2">
            {tabs.map(({ value, label }) => {
                const isActive = active === value
                const count = counts?.[value]
                return (
                    <button
                        key={value}
                        onClick={() => onChange(value)}
                        className={[
                            'px-4 py-1.5 text-sm rounded-full border transition-colors flex items-center gap-1.5',
                            isActive
                                ? 'bg-primary text-white border-primary'
                                : 'bg-surface text-content-secondary border-border hover:border-border-strong hover:text-content-primary',
                        ].join(' ')}
                    >
                        {label}
                        {count !== undefined && (
                            <span className={[
                                'text-xs px-1.5 py-0.5 rounded-full font-medium',
                                isActive
                                    ? 'bg-white/20 text-white'
                                    : 'bg-surface-subtle text-content-muted',
                            ].join(' ')}>
                                {count}
                            </span>
                        )}
                    </button>
                )
            })}
        </div>
    )
}

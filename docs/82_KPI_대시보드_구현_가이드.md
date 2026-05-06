# KPI 대시보드 구현 가이드

> 관리자 페이지에 KPI 측정 대시보드 추가
> 소요 시간: 30분

## 1. 개요

관리자가 `/admin/kpi` 페이지에서 주요 KPI를 한눈에 확인할 수 있는 대시보드를 만듭니다.

**기능:**
- 주요 지표 한눈에 보기 (가입자, DAU, 댓글, 반응, 투표)
- 주간 증감률 표시
- 7일 추이 그래프
- 목표 대비 달성률
- CSV 다운로드

## 2. 파일 구조

```
whynali/
├── app/
│   └── admin/
│       └── kpi/
│           └── page.tsx          # KPI 대시보드 페이지
├── app/api/
│   └── admin/
│       └── kpi/
│           └── route.ts          # KPI 데이터 API
└── lib/
    └── kpi/
        └── calculator.ts         # KPI 계산 로직
```

## 3. KPI 계산 로직 구현

`whynali/lib/kpi/calculator.ts` 파일 생성:

```typescript
/**
 * whynali/lib/kpi/calculator.ts
 *
 * KPI 지표 계산 유틸리티
 *
 * Supabase에서 데이터를 조회하여 주요 KPI를 계산합니다.
 */

import { createAdminClient } from '@/lib/supabase/server'

export interface KPIMetrics {
    totalUsers: number
    usersGrowth: number
    activeIssues: number
    issuesGrowth: number
    totalComments: number
    commentsGrowth: number
    totalReactions: number
    reactionsGrowth: number
    totalVotes: number
    votesGrowth: number
    commentParticipationRate: number
    reactionParticipationRate: number
    avgReactionsPerIssue: number
    avgCommentsPerIssue: number
}

export interface DailyStats {
    date: string
    users: number
    comments: number
    reactions: number
    votes: number
}

export async function calculateKPIMetrics(): Promise<KPIMetrics> {
    const supabase = createAdminClient()

    // 1주일 전 날짜
    const oneWeekAgo = new Date()
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

    // 현재 총 가입자
    const { count: totalUsers } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })

    // 지난 주 가입자
    const { count: usersLastWeek } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .lt('created_at', oneWeekAgo.toISOString())

    const usersGrowth = totalUsers && usersLastWeek
        ? ((totalUsers - usersLastWeek) / usersLastWeek) * 100
        : 0

    // 활성 이슈
    const { count: activeIssues } = await supabase
        .from('issues')
        .select('*', { count: 'exact', head: true })
        .eq('approval_status', 'approved')
        .eq('is_hidden', false)

    const { count: issuesLastWeek } = await supabase
        .from('issues')
        .select('*', { count: 'exact', head: true })
        .eq('approval_status', 'approved')
        .eq('is_hidden', false)
        .lt('created_at', oneWeekAgo.toISOString())

    const issuesGrowth = activeIssues && issuesLastWeek
        ? ((activeIssues - issuesLastWeek) / issuesLastWeek) * 100
        : 0

    // 누적 댓글
    const { count: totalComments } = await supabase
        .from('comments')
        .select('*', { count: 'exact', head: true })
        .eq('is_hidden', false)

    const { count: commentsLastWeek } = await supabase
        .from('comments')
        .select('*', { count: 'exact', head: true })
        .eq('is_hidden', false)
        .lt('created_at', oneWeekAgo.toISOString())

    const commentsGrowth = totalComments && commentsLastWeek
        ? ((totalComments - commentsLastWeek) / commentsLastWeek) * 100
        : 0

    // 누적 반응
    const { count: totalReactions } = await supabase
        .from('reactions')
        .select('*', { count: 'exact', head: true })

    const { count: reactionsLastWeek } = await supabase
        .from('reactions')
        .select('*', { count: 'exact', head: true })
        .lt('created_at', oneWeekAgo.toISOString())

    const reactionsGrowth = totalReactions && reactionsLastWeek
        ? ((totalReactions - reactionsLastWeek) / reactionsLastWeek) * 100
        : 0

    // 투표 참여
    const { count: totalVotes } = await supabase
        .from('user_votes')
        .select('*', { count: 'exact', head: true })

    const { count: votesLastWeek } = await supabase
        .from('user_votes')
        .select('*', { count: 'exact', head: true })
        .lt('created_at', oneWeekAgo.toISOString())

    const votesGrowth = totalVotes && votesLastWeek
        ? ((totalVotes - votesLastWeek) / votesLastWeek) * 100
        : 0

    // 참여율 계산
    const { count: commentingUsers } = await supabase
        .from('comments')
        .select('user_id', { count: 'exact', head: true })

    const { count: reactingUsers } = await supabase
        .from('reactions')
        .select('user_id', { count: 'exact', head: true })

    const commentParticipationRate = totalUsers && commentingUsers
        ? (commentingUsers / totalUsers) * 100
        : 0

    const reactionParticipationRate = totalUsers && reactingUsers
        ? (reactingUsers / totalUsers) * 100
        : 0

    // 이슈당 평균 계산
    const avgReactionsPerIssue = activeIssues && totalReactions
        ? totalReactions / activeIssues
        : 0

    const avgCommentsPerIssue = activeIssues && totalComments
        ? totalComments / activeIssues
        : 0

    return {
        totalUsers: totalUsers || 0,
        usersGrowth: Math.round(usersGrowth * 10) / 10,
        activeIssues: activeIssues || 0,
        issuesGrowth: Math.round(issuesGrowth * 10) / 10,
        totalComments: totalComments || 0,
        commentsGrowth: Math.round(commentsGrowth * 10) / 10,
        totalReactions: totalReactions || 0,
        reactionsGrowth: Math.round(reactionsGrowth * 10) / 10,
        totalVotes: totalVotes || 0,
        votesGrowth: Math.round(votesGrowth * 10) / 10,
        commentParticipationRate: Math.round(commentParticipationRate * 10) / 10,
        reactionParticipationRate: Math.round(reactionParticipationRate * 10) / 10,
        avgReactionsPerIssue: Math.round(avgReactionsPerIssue * 10) / 10,
        avgCommentsPerIssue: Math.round(avgCommentsPerIssue * 10) / 10,
    }
}

export async function getDailyStats(days: number = 7): Promise<DailyStats[]> {
    const supabase = createAdminClient()

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // 일별 댓글 수
    const { data: commentsData } = await supabase
        .from('comments')
        .select('created_at')
        .gte('created_at', startDate.toISOString())

    // 일별 반응 수
    const { data: reactionsData } = await supabase
        .from('reactions')
        .select('created_at')
        .gte('created_at', startDate.toISOString())

    // 일별 투표 수
    const { data: votesData } = await supabase
        .from('user_votes')
        .select('created_at')
        .gte('created_at', startDate.toISOString())

    // 일별 가입자 수
    const { data: usersData } = await supabase
        .from('users')
        .select('created_at')
        .gte('created_at', startDate.toISOString())

    // 날짜별로 집계
    const statsMap = new Map<string, DailyStats>()

    const processData = (data: any[] | null, key: keyof Omit<DailyStats, 'date'>) => {
        if (!data) return

        data.forEach(item => {
            const date = new Date(item.created_at).toISOString().split('T')[0]

            if (!statsMap.has(date)) {
                statsMap.set(date, {
                    date,
                    users: 0,
                    comments: 0,
                    reactions: 0,
                    votes: 0,
                })
            }

            const stats = statsMap.get(date)!
            stats[key]++
        })
    }

    processData(usersData, 'users')
    processData(commentsData, 'comments')
    processData(reactionsData, 'reactions')
    processData(votesData, 'votes')

    // 날짜순 정렬
    return Array.from(statsMap.values()).sort((a, b) =>
        a.date.localeCompare(b.date)
    )
}
```

## 4. API 엔드포인트 구현

`whynali/app/api/admin/kpi/route.ts` 파일 생성:

```typescript
/**
 * whynali/app/api/admin/kpi/route.ts
 *
 * KPI 데이터 조회 API
 *
 * 관리자 권한 필요. KPI 지표와 일별 통계를 반환합니다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { calculateKPIMetrics, getDailyStats } from '@/lib/kpi/calculator'

export async function GET(request: NextRequest) {
    try {
        // 관리자 권한 확인
        const supabase = await createServerClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json(
                { error: 'UNAUTHORIZED', message: '로그인이 필요합니다.' },
                { status: 401 }
            )
        }

        const adminEmails = process.env.ADMIN_EMAILS?.split(',') || []
        if (!adminEmails.includes(user.email || '')) {
            return NextResponse.json(
                { error: 'FORBIDDEN', message: '관리자 권한이 필요합니다.' },
                { status: 403 }
            )
        }

        // KPI 계산
        const metrics = await calculateKPIMetrics()
        const dailyStats = await getDailyStats(7)

        return NextResponse.json({
            metrics,
            dailyStats,
            generatedAt: new Date().toISOString(),
        })
    } catch (error: any) {
        console.error('KPI API 오류:', error)
        return NextResponse.json(
            { error: 'INTERNAL_ERROR', message: error.message },
            { status: 500 }
        )
    }
}
```

## 5. 대시보드 페이지 구현

`whynali/app/admin/kpi/page.tsx` 파일 생성:

```typescript
/**
 * whynali/app/admin/kpi/page.tsx
 *
 * KPI 대시보드 페이지
 *
 * 주요 지표와 추이 그래프를 표시합니다.
 */

'use client'

import { useEffect, useState } from 'react'
import { KPIMetrics, DailyStats } from '@/lib/kpi/calculator'

interface KPIResponse {
    metrics: KPIMetrics
    dailyStats: DailyStats[]
    generatedAt: string
}

export default function KPIDashboardPage() {
    const [data, setData] = useState<KPIResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        fetchKPIData()
    }, [])

    const fetchKPIData = async () => {
        try {
            setLoading(true)
            const response = await fetch('/api/admin/kpi')

            if (!response.ok) {
                throw new Error('KPI 데이터를 불러올 수 없습니다.')
            }

            const result = await response.json()
            setData(result)
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const downloadCSV = () => {
        if (!data) return

        const { metrics, dailyStats } = data

        let csv = '왜난리 KPI 리포트\n'
        csv += `생성일,${new Date(data.generatedAt).toLocaleString('ko-KR')}\n\n`
        csv += '핵심 지표\n'
        csv += '지표,현재값,주간 증감률\n'
        csv += `가입자 수,${metrics.totalUsers},${metrics.usersGrowth}%\n`
        csv += `활성 이슈,${metrics.activeIssues},${metrics.issuesGrowth}%\n`
        csv += `누적 댓글,${metrics.totalComments},${metrics.commentsGrowth}%\n`
        csv += `누적 반응,${metrics.totalReactions},${metrics.reactionsGrowth}%\n`
        csv += `투표 참여,${metrics.totalVotes},${metrics.votesGrowth}%\n\n`
        csv += '일별 통계\n'
        csv += '날짜,가입자,댓글,반응,투표\n'
        dailyStats.forEach(stat => {
            csv += `${stat.date},${stat.users},${stat.comments},${stat.reactions},${stat.votes}\n`
        })

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = `whynali-kpi-${new Date().toISOString().split('T')[0]}.csv`
        link.click()
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 p-8">
                <div className="max-w-7xl mx-auto">
                    <p className="text-gray-600">KPI 데이터 로딩 중...</p>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gray-50 p-8">
                <div className="max-w-7xl mx-auto">
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <p className="text-red-800">{error}</p>
                    </div>
                </div>
            </div>
        )
    }

    if (!data) return null

    const { metrics, dailyStats } = data

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-7xl mx-auto space-y-8">
                {/* 헤더 */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">KPI 대시보드</h1>
                        <p className="text-gray-600 mt-2">
                            마지막 업데이트: {new Date(data.generatedAt).toLocaleString('ko-KR')}
                        </p>
                    </div>
                    <div className="flex gap-4">
                        <button
                            onClick={fetchKPIData}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                            새로고침
                        </button>
                        <button
                            onClick={downloadCSV}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                        >
                            CSV 다운로드
                        </button>
                    </div>
                </div>

                {/* 핵심 지표 카드 */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <KPICard
                        title="가입자 수"
                        value={metrics.totalUsers}
                        growth={metrics.usersGrowth}
                        suffix="명"
                    />
                    <KPICard
                        title="활성 이슈"
                        value={metrics.activeIssues}
                        growth={metrics.issuesGrowth}
                        suffix="개"
                    />
                    <KPICard
                        title="누적 댓글"
                        value={metrics.totalComments}
                        growth={metrics.commentsGrowth}
                        suffix="개"
                    />
                    <KPICard
                        title="누적 반응"
                        value={metrics.totalReactions}
                        growth={metrics.reactionsGrowth}
                        suffix="개"
                    />
                    <KPICard
                        title="투표 참여"
                        value={metrics.totalVotes}
                        growth={metrics.votesGrowth}
                        suffix="회"
                    />
                    <KPICard
                        title="댓글 참여율"
                        value={metrics.commentParticipationRate}
                        suffix="%"
                        showGrowth={false}
                    />
                </div>

                {/* 추가 지표 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white rounded-lg shadow p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">
                            이슈당 평균 참여
                        </h3>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-gray-600">평균 반응 수</span>
                                <span className="text-2xl font-bold text-gray-900">
                                    {metrics.avgReactionsPerIssue.toFixed(1)}개
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-600">평균 댓글 수</span>
                                <span className="text-2xl font-bold text-gray-900">
                                    {metrics.avgCommentsPerIssue.toFixed(1)}개
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">
                            참여율
                        </h3>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-gray-600">반응 참여율</span>
                                <span className="text-2xl font-bold text-gray-900">
                                    {metrics.reactionParticipationRate.toFixed(1)}%
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-600">댓글 참여율</span>
                                <span className="text-2xl font-bold text-gray-900">
                                    {metrics.commentParticipationRate.toFixed(1)}%
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 일별 추이 테이블 */}
                <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                        최근 7일 추이
                    </h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b">
                                    <th className="text-left py-3 px-4">날짜</th>
                                    <th className="text-right py-3 px-4">가입자</th>
                                    <th className="text-right py-3 px-4">댓글</th>
                                    <th className="text-right py-3 px-4">반응</th>
                                    <th className="text-right py-3 px-4">투표</th>
                                </tr>
                            </thead>
                            <tbody>
                                {dailyStats.map(stat => (
                                    <tr key={stat.date} className="border-b last:border-0">
                                        <td className="py-3 px-4">{stat.date}</td>
                                        <td className="text-right py-3 px-4">{stat.users}</td>
                                        <td className="text-right py-3 px-4">{stat.comments}</td>
                                        <td className="text-right py-3 px-4">{stat.reactions}</td>
                                        <td className="text-right py-3 px-4">{stat.votes}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    )
}

interface KPICardProps {
    title: string
    value: number
    growth?: number
    suffix?: string
    showGrowth?: boolean
}

function KPICard({ title, value, growth, suffix = '', showGrowth = true }: KPICardProps) {
    const isPositive = growth && growth > 0
    const isNegative = growth && growth < 0

    return (
        <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-600 mb-2">{title}</h3>
            <div className="flex items-end justify-between">
                <p className="text-3xl font-bold text-gray-900">
                    {value.toLocaleString()}{suffix}
                </p>
                {showGrowth && growth !== undefined && (
                    <div className={`flex items-center gap-1 text-sm font-medium ${
                        isPositive ? 'text-green-600' :
                        isNegative ? 'text-red-600' :
                        'text-gray-600'
                    }`}>
                        {isPositive && '↑'}
                        {isNegative && '↓'}
                        {Math.abs(growth).toFixed(1)}%
                    </div>
                )}
            </div>
        </div>
    )
}
```

## 6. 관리자 메뉴에 추가

`whynali/app/admin/layout.tsx` 수정:

```typescript
// 메뉴 항목에 KPI 추가
const menuItems = [
    { href: '/admin', label: '대시보드' },
    { href: '/admin/kpi', label: 'KPI 리포트' }, // 추가
    { href: '/admin/issues', label: '이슈 관리' },
    // ... 기타 메뉴
]
```

## 7. 배포 및 확인

```bash
# 로컬 테스트
npm run dev

# /admin/kpi 접속하여 확인

# 문제 없으면 배포
git add .
git commit -m "feat: KPI 대시보드 추가"
git push
```

## 8. 사용 방법

### 8.1 KPI 확인

1. 관리자 계정으로 로그인
2. `/admin/kpi` 접속
3. 주요 지표 확인

### 8.2 주간 리포트 작성

1. CSV 다운로드 버튼 클릭
2. 엑셀로 열기
3. 목표 대비 달성률 수동 입력
4. 팀원들과 공유

### 8.3 추이 분석

7일 추이 테이블을 보면서:
- 어느 날 급증했는지 확인
- 주말/평일 차이 분석
- 특정 이벤트 효과 측정

## 9. 개선 아이디어

### 9.1 차트 추가

[Recharts](https://recharts.org/) 라이브러리 추가:

```bash
npm install recharts
```

라인 차트 컴포넌트:

```typescript
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

function DailyStatsChart({ data }: { data: DailyStats[] }) {
    return (
        <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="comments" stroke="#3b82f6" />
                <Line type="monotone" dataKey="reactions" stroke="#10b981" />
            </LineChart>
        </ResponsiveContainer>
    )
}
```

### 9.2 목표 설정 기능

목표를 데이터베이스에 저장하고 달성률 자동 계산:

```sql
CREATE TABLE kpi_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    target_users INT,
    target_comments INT,
    target_reactions INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 9.3 자동 알림

목표 달성 시 Slack/Discord 알림:

```typescript
// 목표 달성 시 webhook 호출
if (metrics.totalUsers >= goal.target_users) {
    await fetch(process.env.SLACK_WEBHOOK_URL!, {
        method: 'POST',
        body: JSON.stringify({
            text: '축하합니다! 가입자 목표를 달성했습니다! 🎉'
        })
    })
}
```

## 10. 완료 체크리스트

- [ ] `lib/kpi/calculator.ts` 파일 생성 완료
- [ ] `app/api/admin/kpi/route.ts` 파일 생성 완료
- [ ] `app/admin/kpi/page.tsx` 파일 생성 완료
- [ ] 관리자 메뉴에 KPI 추가 완료
- [ ] 로컬에서 테스트 완료
- [ ] 배포 완료
- [ ] 관리자 페이지에서 KPI 확인 완료
- [ ] CSV 다운로드 테스트 완료
- [ ] 주간 리포트 작성 프로세스 확립 완료

---

**다음 단계:**
`/docs/83_성장_전략_플레이북.md` - KPI 목표 달성을 위한 구체적인 실행 전략

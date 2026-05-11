'use client'

import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Tooltip,
    Legend,
    type ChartData,
    type ChartOptions,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

interface ChartMetrics {
    userProgress: number
    commentProgress: number
    reactionProgress: number
    voteProgress: number
    currentActiveIssues: number
    commentParticipation: number
    reactionParticipation: number
    voteParticipation: number
    targets: {
        activeIssues: number
        commentParticipation: number
        reactionParticipation: number
        voteParticipation: number
    }
    visitorsBySource: {
        threads: number
        instagram: number
        x: number
        kakao: number
        youtube: number
        tiktok: number
        direct: number
        organic: number
        other: number
    }
}

interface WeeklyProgress {
    week: number
    targetUsers: number
    currentUsers: number
    targetComments: number
    currentComments: number
}

interface Props {
    metrics: ChartMetrics
    weeklyProgress: WeeklyProgress[]
}

const ACHIEVED_COLOR  = 'rgba(16,185,129,0.82)'   // 초록 — 목표 달성
const PROGRESS_COLOR  = 'rgba(99,102,241,0.82)'   // 인디고 — 진행중
const TARGET_COLOR    = 'rgba(209,213,219,0.75)'  // 회색 — 목표

function achieveColor(value: number) {
    return value >= 100 ? ACHIEVED_COLOR : PROGRESS_COLOR
}

export default function KPICharts({ metrics, weeklyProgress }: Props) {
    const issueProgress = metrics.targets.activeIssues > 0
        ? (metrics.currentActiveIssues / metrics.targets.activeIssues) * 100
        : 0

    const achievementValues = [
        Math.min(metrics.userProgress, 150),
        Math.min(issueProgress, 150),
        Math.min(metrics.commentProgress, 150),
        Math.min(metrics.reactionProgress, 150),
        Math.min(metrics.voteProgress, 150),
    ]

    // ── 차트 1: KPI 달성률 수평 바 ──────────────────────────
    const achievementData: ChartData<'bar'> = {
        labels: ['가입자', '진행중 이슈', '댓글', '반응', '투표'],
        datasets: [
            {
                label: '달성률 (%)',
                data: achievementValues,
                backgroundColor: achievementValues.map(achieveColor),
                borderRadius: 5,
                borderSkipped: false,
                barThickness: 22,
            },
            {
                label: '목표 (100%)',
                data: [100, 100, 100, 100, 100],
                backgroundColor: 'rgba(0,0,0,0)',
                borderColor: 'rgba(156,163,175,0.6)',
                borderWidth: 1.5,
                borderDash: [4, 3],
                borderRadius: 0,
                borderSkipped: false,
                barThickness: 2,
            },
        ],
    }

    const achievementOptions: ChartOptions<'bar'> = {
        indexAxis: 'y',
        responsive: true,
        animation: { duration: 700, easing: 'easeInOutQuart' },
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    label: (ctx) => {
                        if (ctx.datasetIndex === 1) return ''
                        return ` ${Number(ctx.raw).toFixed(0)}%`
                    },
                },
            },
        },
        scales: {
            x: {
                max: 150,
                grid: { color: 'rgba(243,244,246,1)' },
                ticks: {
                    font: { size: 11 },
                    color: '#9ca3af',
                    callback: (v) => `${v}%`,
                },
            },
            y: {
                grid: { display: false },
                ticks: { font: { size: 12, weight: 'bold' }, color: '#374151' },
            },
        },
    }

    // ── 차트 2: 주차별 마일스톤 바 ──────────────────────────
    const weeklyData: ChartData<'bar'> = {
        labels: weeklyProgress.map(w => `${w.week}주차`),
        datasets: [
            {
                label: '목표 가입자',
                data: weeklyProgress.map(w => w.targetUsers),
                backgroundColor: TARGET_COLOR,
                borderRadius: 5,
                borderSkipped: false,
            },
            {
                label: '현재 가입자',
                data: weeklyProgress.map(w => w.currentUsers),
                backgroundColor: PROGRESS_COLOR,
                borderRadius: 5,
                borderSkipped: false,
            },
            {
                label: '목표 댓글',
                data: weeklyProgress.map(w => w.targetComments),
                backgroundColor: 'rgba(253,230,138,0.75)',
                borderRadius: 5,
                borderSkipped: false,
            },
            {
                label: '현재 댓글',
                data: weeklyProgress.map(w => w.currentComments),
                backgroundColor: 'rgba(245,158,11,0.82)',
                borderRadius: 5,
                borderSkipped: false,
            },
        ],
    }

    const weeklyOptions: ChartOptions<'bar'> = {
        responsive: true,
        animation: { duration: 700, easing: 'easeInOutQuart' },
        plugins: {
            legend: {
                position: 'bottom',
                labels: { font: { size: 11 }, color: '#4b5563', padding: 16, boxWidth: 12, boxHeight: 12 },
            },
            tooltip: { mode: 'index', intersect: false },
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: { font: { size: 12 }, color: '#6b7280' },
            },
            y: {
                grid: { color: 'rgba(243,244,246,1)' },
                ticks: { font: { size: 11 }, color: '#9ca3af' },
                beginAtZero: true,
            },
        },
    }

    // ── 차트 3: 참여율 비교 바 ───────────────────────────────
    const participationData: ChartData<'bar'> = {
        labels: ['댓글 참여율', '반응 참여율', '투표 참여율'],
        datasets: [
            {
                label: '목표',
                data: [
                    metrics.targets.commentParticipation,
                    metrics.targets.reactionParticipation,
                    metrics.targets.voteParticipation,
                ],
                backgroundColor: TARGET_COLOR,
                borderRadius: 5,
                borderSkipped: false,
            },
            {
                label: '현재',
                data: [
                    parseFloat(metrics.commentParticipation.toFixed(1)),
                    parseFloat(metrics.reactionParticipation.toFixed(1)),
                    parseFloat(metrics.voteParticipation.toFixed(1)),
                ],
                backgroundColor: [
                    metrics.commentParticipation  >= metrics.targets.commentParticipation  ? ACHIEVED_COLOR : PROGRESS_COLOR,
                    metrics.reactionParticipation >= metrics.targets.reactionParticipation ? ACHIEVED_COLOR : PROGRESS_COLOR,
                    metrics.voteParticipation     >= metrics.targets.voteParticipation     ? ACHIEVED_COLOR : PROGRESS_COLOR,
                ],
                borderRadius: 5,
                borderSkipped: false,
            },
        ],
    }

    const participationOptions: ChartOptions<'bar'> = {
        responsive: true,
        animation: { duration: 700, easing: 'easeInOutQuart' },
        plugins: {
            legend: {
                position: 'bottom',
                labels: { font: { size: 11 }, color: '#4b5563', padding: 16, boxWidth: 12, boxHeight: 12 },
            },
            tooltip: {
                callbacks: {
                    label: (ctx) => ` ${ctx.dataset.label}: ${Number(ctx.raw).toFixed(1)}%`,
                },
            },
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: { font: { size: 12 }, color: '#6b7280' },
            },
            y: {
                grid: { color: 'rgba(243,244,246,1)' },
                ticks: { font: { size: 11 }, color: '#9ca3af', callback: (v) => `${v}%` },
                beginAtZero: true,
            },
        },
    }

    return (
        <div className="space-y-6">

            {/* 상단: KPI 달성률 + 참여율 나란히 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
                    <p className="text-sm font-semibold text-gray-800 mb-0.5">KPI 달성률</p>
                    <p className="text-xs text-gray-400 mb-1">목표 대비 현재 달성률 —
                        <span className="ml-1 inline-flex items-center gap-1">
                            <span className="inline-block w-2 h-2 rounded-sm bg-emerald-500" />
                            <span>달성</span>
                        </span>
                        <span className="ml-2 inline-flex items-center gap-1">
                            <span className="inline-block w-2 h-2 rounded-sm bg-indigo-500" />
                            <span>진행중</span>
                        </span>
                    </p>
                    <Bar data={achievementData} options={achievementOptions} />
                </div>

                <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
                    <p className="text-sm font-semibold text-gray-800 mb-0.5">참여율 비교</p>
                    <p className="text-xs text-gray-400 mb-4">댓글·반응·투표 — 목표 vs 현재 (%)</p>
                    <Bar data={participationData} options={participationOptions} />
                </div>

            </div>

            {/* 주차별 마일스톤 */}
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
                <p className="text-sm font-semibold text-gray-800 mb-0.5">주차별 마일스톤</p>
                <p className="text-xs text-gray-400 mb-4">목표 가입자·댓글 vs 현재값 비교</p>
                {weeklyProgress.length > 0 ? (
                    <Bar data={weeklyData} options={weeklyOptions} />
                ) : (
                    <div className="h-52 flex flex-col items-center justify-center text-gray-400">
                        <p className="text-sm">주차별 마일스톤 데이터가 없습니다</p>
                        <p className="text-xs mt-1">이번 달 KPI 목표를 설정하면 표시됩니다</p>
                    </div>
                )}
            </div>

        </div>
    )
}

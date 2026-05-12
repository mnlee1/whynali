'use client'

import { Line } from 'react-chartjs-2'
import {
    Chart as ChartJS,
    CategoryScale, LinearScale,
    PointElement, LineElement,
    Filler, Tooltip,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip)

interface Props {
    data: number[]
    color: string   // CSS color 값 (예: '#6366f1' 또는 'rgb(99,102,241)')
    height?: number
}

export default function Sparkline({ data, color, height = 44 }: Props) {
    const hasData = data.some(v => v > 0)

    const chartData = {
        labels: data.map((_, i) => `${data.length - 1 - i}일 전`),
        datasets: [{
            data,
            borderColor: color,
            backgroundColor: `${color}1a`,  // 10% 투명도 fill
            fill: true,
            tension: 0.45,
            pointRadius: 0,
            pointHoverRadius: 3,
            borderWidth: 1.5,
        }],
    }

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500 },
        plugins: {
            legend: { display: false },
            tooltip: {
                enabled: hasData,
                displayColors: false,
                callbacks: { label: (ctx: { parsed: { y: number } }) => ` ${ctx.parsed.y}` },
            },
        },
        scales: {
            x: { display: false },
            y: { display: false, beginAtZero: true },
        },
    }

    if (!hasData) {
        return (
            <div style={{ height }} className="flex items-end">
                <div className="w-full border-t border-dashed border-gray-200" />
            </div>
        )
    }

    return (
        <div style={{ height }}>
            <Line data={chartData} options={options as Parameters<typeof Line>[0]['options']} />
        </div>
    )
}

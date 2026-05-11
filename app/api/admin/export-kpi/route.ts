/**
 * app/api/admin/export-kpi/route.ts
 *
 * KPI 데이터를 Google Sheets로 내보내는 관리자 전용 API.
 *
 * POST /api/admin/export-kpi
 * Body: { year: number, month: number }
 */

import { NextRequest, NextResponse } from 'next/server'
import { calculateKPI } from '@/lib/kpi/calculator'
import { exportKPIToGoogleSheets } from '@/lib/kpi/google-sheets-export'

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const year: number = body.year ?? new Date().getFullYear()
        const month: number = body.month ?? (new Date().getMonth() + 1)

        const kpi = await calculateKPI(year, month)
        const result = await exportKPIToGoogleSheets(year, month, kpi)

        const spreadsheetId = process.env.KPI_SPREADSHEET_ID
        const sheetUrl = spreadsheetId
            ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}`
            : null

        return NextResponse.json({
            success: true,
            action: result.action,
            label: result.label,
            sheetUrl,
        })
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : '알 수 없는 오류'
        console.error('[export-kpi]', message)
        return NextResponse.json({ success: false, error: message }, { status: 500 })
    }
}

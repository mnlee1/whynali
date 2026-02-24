/**
 * lib/parse-params.ts
 *
 * API Route 쿼리 파라미터 공통 파서
 *
 * Zod 없이 limit/offset/enum 파라미터를 안전하게 파싱한다.
 * NaN, 음수, 허용 범위 초과 등 비정상 입력을 조기에 방어하고
 * 파싱 실패 시 400 에러를 즉시 반환할 수 있는 result 객체를 돌려준다.
 *
 * 사용 예시:
 *   const limit = parseLimitOffset(searchParams).limit
 *
 *   const sortResult = parseEnum(sort, ['latest', 'heat'] as const, 'latest')
 *   if (sortResult.error) return NextResponse.json({ error: sortResult.error }, { status: 400 })
 *   const safeSort = sortResult.value
 */

import { NextResponse } from 'next/server'

// ── limit / offset ────────────────────────────────────────────────────────────

interface LimitOffsetOptions {
    defaultLimit?: number
    maxLimit?: number
    defaultOffset?: number
}

interface LimitOffsetResult {
    limit: number
    offset: number
    error: NextResponse | null
}

/**
 * parseLimitOffset - limit/offset 쿼리 파라미터 파싱 및 검증
 *
 * NaN, 음수, max 초과를 방어한다. 검증 실패 시 error에 400 응답이 담긴다.
 */
export function parseLimitOffset(
    searchParams: URLSearchParams,
    options: LimitOffsetOptions = {}
): LimitOffsetResult {
    const { defaultLimit = 20, maxLimit = 100, defaultOffset = 0 } = options

    const rawLimit = searchParams.get('limit')
    const rawOffset = searchParams.get('offset')

    const limit = rawLimit !== null ? parseInt(rawLimit, 10) : defaultLimit
    const offset = rawOffset !== null ? parseInt(rawOffset, 10) : defaultOffset

    if (rawLimit !== null && (isNaN(limit) || limit < 1)) {
        return {
            limit: defaultLimit,
            offset: defaultOffset,
            error: NextResponse.json(
                { error: 'INVALID_PARAM', message: 'limit은 1 이상의 정수여야 합니다.' },
                { status: 400 }
            ),
        }
    }

    if (rawOffset !== null && (isNaN(offset) || offset < 0)) {
        return {
            limit: defaultLimit,
            offset: defaultOffset,
            error: NextResponse.json(
                { error: 'INVALID_PARAM', message: 'offset은 0 이상의 정수여야 합니다.' },
                { status: 400 }
            ),
        }
    }

    return {
        limit: Math.min(limit, maxLimit),
        offset,
        error: null,
    }
}

// ── enum ──────────────────────────────────────────────────────────────────────

interface EnumResult<T> {
    value: T
    error: NextResponse | null
}

/**
 * parseEnum - 허용 값 목록 기반 enum 파라미터 파싱
 *
 * 허용 목록에 없는 값이 들어오면 error에 400 응답이 담긴다.
 * strict=false(기본)이면 허용 목록 외 값은 defaultValue로 대체한다.
 *
 * 예시:
 *   const { value: sort } = parseEnum(raw, ['latest', 'heat'] as const, 'latest')
 */
export function parseEnum<T extends string>(
    raw: string | null,
    allowed: readonly T[],
    defaultValue: T,
    strict = false
): EnumResult<T> {
    if (raw === null) {
        return { value: defaultValue, error: null }
    }

    if ((allowed as readonly string[]).includes(raw)) {
        return { value: raw as T, error: null }
    }

    if (strict) {
        return {
            value: defaultValue,
            error: NextResponse.json(
                {
                    error: 'INVALID_PARAM',
                    message: `허용되지 않는 값입니다. (허용: ${allowed.join(', ')})`,
                },
                { status: 400 }
            ),
        }
    }

    return { value: defaultValue, error: null }
}

// ── URL 파싱 ──────────────────────────────────────────────────────────────────

/**
 * parseUrl - URL 파라미터 파싱 및 검증
 *
 * 유효하지 않은 URL이면 error에 400 응답이 담긴다.
 */
export function parseUrl(
    raw: string | null,
    fieldName = 'url'
): { value: string | null; error: NextResponse | null } {
    if (!raw || !raw.trim()) {
        return { value: null, error: null }
    }

    try {
        new URL(raw.trim())
        return { value: raw.trim(), error: null }
    } catch {
        return {
            value: null,
            error: NextResponse.json(
                { error: 'INVALID_PARAM', message: `${fieldName}이 올바른 URL 형식이 아닙니다.` },
                { status: 400 }
            ),
        }
    }
}

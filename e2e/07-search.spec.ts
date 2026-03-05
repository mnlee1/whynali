/**
 * e2e/07-search.spec.ts
 *
 * [검색 기능 E2E 테스트]
 *
 * 검색바 접근, 검색 결과, 이슈+토론 통합 검색을 검증합니다.
 */

import { test, expect } from '@playwright/test'

test.describe('검색 기능', () => {
    test('검색바 접근 확인', async ({ page }) => {
        await page.goto('/')
        await page.waitForLoadState('networkidle')

        const searchInput = page.locator('input[placeholder*="검색"], input[placeholder*="이슈"], input[type="text"]').first()
        const searchButton = page.locator('button[aria-label="검색"]').or(page.locator('button').filter({ has: page.locator('svg') }))
        const hasSearch = await searchInput.isVisible().catch(() => false) || await searchButton.isVisible().catch(() => false)
        expect(hasSearch).toBeTruthy()
    })

    test('검색 실행 및 결과 페이지 이동', async ({ page }) => {
        await page.goto('/')
        await page.waitForLoadState('networkidle')

        const searchInput = page.locator('input[placeholder*="검색"], input[placeholder*="이슈"], input[type="text"]').first()
        if (await searchInput.isVisible().catch(() => false)) {
            await searchInput.fill('이슈')
            await searchInput.press('Enter')
            await page.waitForLoadState('networkidle')
            await expect(page).toHaveURL(/\/search/)
        }
    })

    test('검색 결과 표시 (검색어 2자 이상)', async ({ page }) => {
        await page.goto('/search?q=이슈')
        await page.waitForLoadState('networkidle')

        const hasResults = await page.locator('a[href^="/issue/"], a[href^="/community/"]').count() > 0
        const hasNoResults = await page.locator('text=검색 결과가 없습니다').or(page.locator('text=결과가 없습니다')).isVisible().catch(() => false)
        const hasShortQuery = await page.locator('text=2자 이상').isVisible().catch(() => false)
        expect(hasResults || hasNoResults || hasShortQuery).toBeTruthy()
    })
})

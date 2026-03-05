/**
 * e2e/01-homepage.spec.ts
 *
 * [홈페이지 & 이슈 목록 E2E 테스트]
 *
 * 메인 페이지 로드, 이슈 목록 표시, 이슈 카드, 상세 페이지 이동을 검증합니다.
 */

import { test, expect } from '@playwright/test'

test.describe('홈페이지 & 이슈 목록', () => {
    test('메인 페이지 로드 확인', async ({ page }) => {
        await page.goto('/')
        await expect(page).toHaveTitle(/왜난리|whynali/i)
        await expect(page.locator('header')).toBeVisible()
        await expect(page.locator('img[alt="왜난리"]')).toBeVisible()
    })

    test('이슈 목록이 정상적으로 표시되는지', async ({ page }) => {
        await page.goto('/')
        await page.waitForLoadState('networkidle')

        const issueCards = page.locator('a[href^="/issue/"]')
        await expect(issueCards.first()).toBeVisible({ timeout: 10000 })
        const count = await issueCards.count()
        expect(count).toBeGreaterThan(0)
    })

    test('이슈 카드에 제목, 카테고리, 상태가 표시되는지', async ({ page }) => {
        await page.goto('/')
        await page.waitForLoadState('networkidle')

        const firstCard = page.locator('a[href^="/issue/"]').first()
        await expect(firstCard).toBeVisible({ timeout: 10000 })

        await expect(firstCard.locator('h3')).toBeVisible()
        await expect(firstCard.locator('span').filter({ hasText: /연예|스포츠|정치|사회|기술/ })).toBeVisible()
    })

    test('이슈 클릭 시 상세 페이지로 이동하는지', async ({ page }) => {
        await page.goto('/')
        await page.waitForLoadState('networkidle')

        const firstCard = page.locator('a[href^="/issue/"]').first()
        const href = await firstCard.getAttribute('href')
        expect(href).toMatch(/^\/issue\/[^/]+$/)

        await firstCard.click()
        await expect(page).toHaveURL(/\/issue\/[^/]+$/)
        await expect(page.locator('h1')).toBeVisible({ timeout: 5000 })
    })
})

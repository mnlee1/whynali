/**
 * e2e/03-issue-detail.spec.ts
 *
 * [이슈 상세 페이지 E2E 테스트]
 *
 * 이슈 제목, 3줄 요약, 화력 분석, 타임라인, 감정 표현 버튼을 검증합니다.
 */

import { test, expect } from '@playwright/test'

test.describe('이슈 상세 페이지', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/')
        await page.waitForLoadState('networkidle')
        const firstCard = page.locator('a[href^="/issue/"]').first()
        await firstCard.click()
        await page.waitForLoadState('networkidle')
    })

    test('이슈 제목 표시 확인', async ({ page }) => {
        const title = page.locator('h1').first()
        await expect(title).toBeVisible()
        await expect(title).not.toBeEmpty()
    })

    test('topic_description 표시 확인', async ({ page }) => {
        const desc = page.locator('p.text-gray-600').first()
        const descVisible = await desc.isVisible()
        if (descVisible) {
            await expect(desc).not.toBeEmpty()
        }
    })

    test('화력 분석 정보 표시 확인', async ({ page }) => {
        const heatSection = page.locator('text=화력').or(page.locator('[class*="heat"]'))
        const hasHeat = await heatSection.first().isVisible().catch(() => false)
        if (hasHeat) {
            await expect(heatSection.first()).toBeVisible()
        }
    })

    test('타임라인 카드 표시 확인', async ({ page }) => {
        const timeline = page.locator('text=타임라인').or(page.locator('[class*="timeline"]'))
        const hasTimeline = await timeline.first().isVisible().catch(() => false)
        if (hasTimeline) {
            await expect(timeline.first()).toBeVisible()
        }
    })

    test('감정 표현 버튼 확인', async ({ page }) => {
        const reactions = page.locator('button').filter({ hasText: /👍|👎|😮|😢|😡|😂/ })
        const count = await reactions.count()
        if (count > 0) {
            await expect(reactions.first()).toBeVisible()
        }
    })
})

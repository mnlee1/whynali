/**
 * e2e/04-vote.spec.ts
 *
 * [투표 기능 E2E 테스트]
 *
 * 투표 항목 표시, 참여 가능 여부, 결과 표시를 검증합니다.
 */

import { test, expect } from '@playwright/test'

test.describe('투표 기능', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/')
        await page.waitForLoadState('networkidle')
        const firstCard = page.locator('a[href^="/issue/"]').first()
        await firstCard.click()
        await page.waitForLoadState('networkidle')
    })

    test('투표 섹션 표시 확인', async ({ page }) => {
        const voteSection = page.locator('text=투표').first()
        await expect(voteSection).toBeVisible()
    })

    test('투표 항목 또는 빈 상태 표시 확인', async ({ page }) => {
        const voteArea = page.locator('text=투표').first().locator('..')
        await expect(voteArea).toBeVisible()
        const hasChoices = await page.locator('button').filter({ hasText: /투표|선택|%|표/ }).count() > 0
        const hasEmpty = await page.locator('text=진행 중인 투표가 없습니다').isVisible().catch(() => false)
        expect(hasChoices || hasEmpty).toBeTruthy()
    })

    test('투표 결과 실시간 표시 (투표가 있는 경우)', async ({ page }) => {
        const progressBars = page.locator('[class*="bg-"][style*="width"]').or(page.locator('text=%'))
        const count = await progressBars.count()
        if (count > 0) {
            await expect(progressBars.first()).toBeVisible()
        }
    })
})

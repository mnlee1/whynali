/**
 * playwright.config.ts
 *
 * [Playwright E2E 테스트 설정]
 *
 * 왜난리 프로젝트의 E2E 테스트를 위한 Playwright 설정입니다.
 * baseURL은 로컬 개발 서버(localhost:3000)를 사용합니다.
 */

import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: [
        ['html', { outputFolder: 'playwright-report' }],
        ['list'],
    ],
    use: {
        baseURL: 'http://localhost:3000',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ],
    timeout: 30000,
    expect: { timeout: 10000 },
})

import { test, expect } from '@playwright/test';

test('startsida laddar', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/.+/);
});

test('startsida innehåller texten "Decathlon"', async ({ page }) => {
  await page.goto('localhost:8080');
  await expect(page.locator('body')).toContainText('Decathlon');
});
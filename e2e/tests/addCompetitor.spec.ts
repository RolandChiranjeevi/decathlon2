import { test, expect } from '@playwright/test';

test('@D-1: Lägg till en deltagare', async ({ page }) => {
  await page.goto('http://localhost:8080');
  await page.getByTestId("competitorNameInput").fill("Vahid");
  await page.getByTestId("addCompetitorBtn").click();

      await expect(page.locator("#standings > tr:nth-of-type(11) > td:nth-of-type(1)")).toHaveText("Vahid");
});
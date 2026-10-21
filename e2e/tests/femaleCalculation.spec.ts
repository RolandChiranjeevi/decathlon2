import { test, expect } from '@playwright/test';
test('@D-2: Lägg till en poäng', async ({ page }) => {
await page.goto('localhost:8080');
await page.getByTestId("competitorNameInput").fill("Henrik Dagård");
  await page.getByTestId("addCompetitorBtn").click();
  await page.getByLabel("Name").fill("Henrik Dagård");
  await page.getByTestId("disciplineSelect").selectOption("heptathlon"); // "Heptathlon"
  await page.getByTestId("eventSelect").selectOption("hep200m"); // "200m (s)"
  await page.getByTestId("rawInput").fill("25");
  await page.getByTestId("saveScoreBtn").click();
  await expect(page.locator('body')).toContainText("Saved: 887 pts");});
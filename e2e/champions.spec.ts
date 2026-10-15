// End-to-end: champions return for the next game (and show on the board), and the
// host picks the next question in the question bank browser.

import { expect, test, type Page } from "@playwright/test";

const SHOTS = process.env.SHOTS_DIR;

async function press(page: Page, ...keys: string[]) {
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  for (const key of keys) await page.keyboard.press(key);
}

/** Family 1 wins: a score fix puts them on 299, then they win the round. */
async function family1Wins(page: Page, name: string) {
  await page.getByLabel(`Score adjustment for ${name}`).fill("299");
  await page.getByRole("button", { name: `Add points to ${name}` }).click();
  await press(page, "n", "q", "1");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await press(page, "x", "x", "x", "x");
  await expect(page.getByText(`The ${name} family wins the game!`)).toBeVisible();
}

test("champions return for the next game, and the host picks a question in the browser", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 820 });
  await page.goto("/");
  await expect(page.getByText(/8,8\d\d surveys/)).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Family name").first().fill("Smith");
  await page.getByLabel("Family name").nth(1).fill("Jones");
  await page.getByRole("button", { name: "Start game" }).click();
  await family1Wins(page, "Smith");

  await expect(page.getByText(/Smith become champions/)).toBeVisible();
  await page.getByRole("button", { name: "Next game" }).click();

  // Setup: Smith are the returning champions; only the challengers are named.
  await expect(page.getByText("Returning champions")).toBeVisible();
  await expect(page.getByText(/more wins? to retire undefeated/)).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/p7-1-setup-champions.png`, fullPage: true });
  await page.getByLabel("Family name").fill("Lee");

  // Pick the first question in the browser before the game starts.
  await page.getByRole("button", { name: "Question bank" }).click();
  await page.getByLabel("Search questions and answers").fill("mother in law");
  // Round 1 takes 6-8 answers, so pick a 6-answer survey to be sure it fits.
  await page.locator("label", { has: page.getByText("Answers", { exact: true }) }).locator("select").selectOption("6");
  const results = page.getByRole("list", { name: "Matching surveys" });
  const first = results.getByRole("button").first();
  await expect(first).toContainText(/mother.in.law|MOTHER.IN.LAW/i);
  const question = (await first.textContent())!;
  await first.click();
  await page.getByRole("button", { name: "Play this next" }).first().click();
  await expect(page.getByText("Playing next:")).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/p7-2-browser.png`, fullPage: true });
  await page.getByRole("button", { name: /Back to the game/ }).first().click();

  await page.getByRole("button", { name: "Start game" }).click();
  const board = await page.context().newPage();
  await board.setViewportSize({ width: 1280, height: 720 });
  await board.goto("/#/board");

  // Round 1 uses the picked question.
  await press(page, "n");
  const asked = (await page.locator(".hg-question__text").textContent())!;
  expect(question).toContain(asked);

  // The champions are marked on the host scoreboard and the board.
  await expect(page.getByText(/Champions · 1 win/)).toBeVisible();
  await expect(board.getByText("CHAMPIONS")).toBeVisible();
  if (SHOTS) {
    await board.screenshot({ path: `${SHOTS}/p7-3-board-ribbon.png` });
    await page.screenshot({ path: `${SHOTS}/p7-4-host-badge.png` });
  }

  // Smith defend their title.
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  await page.getByLabel("Score adjustment for Smith").fill("299");
  await page.getByRole("button", { name: "Add points to Smith" }).click();
  await press(page, "q", "1");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await press(page, "x", "x", "x", "x");
  await expect(page.getByText(/Smith defend their title: 2 wins/)).toBeVisible();
  await page.getByRole("button", { name: "Next game" }).click();
  await expect(page.getByText(/2-time champions/i)).toBeVisible();
});

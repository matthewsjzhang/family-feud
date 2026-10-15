// End-to-end: win a game, then play Fast Money with both players on the host
// console while the audience board follows along (covering, duplicates, result).

import { expect, test, type Page } from "@playwright/test";

async function press(page: Page, ...keys: string[]) {
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  for (const key of keys) await page.keyboard.press(key);
}

/** Smith wins the game: a score fix puts them on 299, then they win round 1. */
async function winGame(page: Page) {
  await page.goto("/");
  await expect(page.getByText(/8,8\d\d surveys/)).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Family name").first().fill("Smith");
  await page.getByLabel("Family name").nth(1).fill("Jones");
  await page.getByRole("button", { name: "Start game" }).click();
  await page.getByLabel("Score adjustment for Smith").fill("299");
  await page.getByRole("button", { name: "Add points to Smith" }).click();
  await press(page, "n", "q", "1");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await press(page, "x", "x", "x", "x");
  await expect(page.getByText("The Smith family wins the game!")).toBeVisible();
}

/** Type five answers into the Fast Money answer box. */
async function answerAll(page: Page, words: string[]) {
  const box = page.getByPlaceholder("Type the answer, press Enter…");
  for (const word of words) {
    await box.fill(word);
    await box.press("Enter");
  }
}

test("Fast Money: both players, a duplicate, covering, and the result on the board", async ({ page }) => {
  await winGame(page);
  const board = await page.context().newPage();
  await board.goto("/#/board");

  // Sound needs a click in the board window first (browser autoplay rules).
  await board.getByRole("button", { name: /enable sound/i }).click();
  await expect(board.getByRole("button", { name: /mute/i })).toBeVisible();

  await page.getByRole("button", { name: "Play Fast Money" }).click();
  await expect(board.getByRole("heading", { name: "Fast Money" })).toBeVisible();
  await expect(board.getByRole("timer")).toContainText("20");

  // Player 1 answers all five against the clock.
  await page.getByRole("button", { name: /Start the clock/ }).click();
  await answerAll(page, ["apple", "banana", "cherry", "grape", "lemon"]);

  // Judging: show each answer, then survey says. Answer 1 is the top answer, the rest miss.
  await press(page, "s", "1");
  await expect(board.getByRole("listitem", { name: /Player 1, question 1: APPLE, \d+ points/ })).toBeVisible();
  for (let i = 0; i < 4; i++) await press(page, "s", "x");
  await expect(board.getByRole("listitem", { name: /Player 1, question 5: LEMON, 0 points/ })).toBeVisible();

  // Player 2: player 1's answers are covered on the board.
  await page.getByRole("button", { name: /Bring out player 2/ }).click();
  await expect(board.getByLabel("Player 1 answers covered")).toBeVisible();
  await expect(board.getByText("APPLE")).toHaveCount(0);
  await expect(board.getByRole("timer")).toContainText("25");

  await page.getByRole("button", { name: /Start the clock/ }).click();
  // Repeating player 1's answer gets the double buzzer: try again.
  await answerAll(page, ["Apple"]);
  await expect(board.getByText(/try again/i).first()).toBeVisible();
  await expect(page.getByText(/Duplicate! Ask again/)).toBeVisible();
  await answerAll(page, ["kiwi", "mango", "peach", "plum", "lime"]);

  // Player 1's answers come back, then player 2's are judged.
  await expect(board.getByLabel("Player 1 answers covered")).toHaveCount(0);
  await expect(board.getByRole("listitem", { name: /Player 1, question 1: APPLE/ })).toBeVisible();
  for (let i = 0; i < 5; i++) await press(page, "s", "x");

  // Nobody can reach 200 with one top answer: the per-point payout shows on both screens.
  const banner = board.getByRole("alert");
  await expect(banner).toContainText("$");
  const total = Number((await board.getByLabel(/^Total: \d+ points$/).getAttribute("aria-label"))!.match(/\d+/)![0]);
  await expect(banner).toContainText(`$${(total * 5).toLocaleString("en-US")}`);
  await expect(page.getByText(`$${(total * 5).toLocaleString("en-US")}`).first()).toBeVisible();

  await page.getByRole("button", { name: "Back to the game" }).click();
  await expect(page.getByText("The Smith family wins the game!")).toBeVisible();
  await expect(board.getByRole("heading", { name: "Fast Money" })).toHaveCount(0);
});

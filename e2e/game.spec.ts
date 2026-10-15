// End-to-end: the host console and the audience board as two real pages in one
// browser, synced over BroadcastChannel, playing the real question bank.

import { expect, test, type Page } from "@playwright/test";

async function openHostAndBoard(page: Page) {
  await page.goto("/");
  await expect(page.getByText(/8,8\d\d surveys/)).toBeVisible({ timeout: 20_000 });
  const board = await page.context().newPage();
  await board.goto("/#/board");
  await expect(board.getByText("Family Feud")).toBeVisible();
  return board;
}

async function startGame(page: Page) {
  await page.getByLabel("Family name").first().fill("Smith");
  await page.getByLabel("Family name").nth(1).fill("Jones");
  await page.getByRole("button", { name: "Start game" }).click();
}

/** Keyboard shortcuts go to the page, not a text box. */
async function press(page: Page, ...keys: string[]) {
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  for (const key of keys) await page.keyboard.press(key);
}

const hiddenTiles = (board: Page) => board.getByRole("listitem", { name: /hidden$/ });

test("a round with a face-off, strikes and a steal, mirrored on the board", async ({ page }) => {
  const board = await openHostAndBoard(page);
  await startGame(page);
  await press(page, "n");

  // The board shows 8 tiles; hidden ones never contain answer text.
  const question = await page.locator(".hg-question__text").textContent();
  await expect(board.getByText(question!)).toBeVisible();
  const answers = board.getByRole("list", { name: "Answer board" }).getByRole("listitem");
  await expect(answers).toHaveCount(8);
  const hiddenCount = await hiddenTiles(board).count();
  expect(hiddenCount).toBeGreaterThanOrEqual(6);

  // Face-off: Smith buzzes and gives the #1 answer.
  await press(page, "q", "1");
  await expect(board.getByRole("listitem", { name: /^Answer 1: .+ points$/ })).toBeVisible();
  await expect(board.getByText("The Smith family won the face-off")).toBeVisible();

  // Play, then three strikes. The big X's must actually appear on the board.
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await press(page, "x");
  await expect(board.locator(".gb-strike__x")).toHaveCount(1);
  await expect(board.locator(".gb-strike__x").first()).toHaveCSS("opacity", "1");
  await press(page, "x", "x");
  await expect(board.getByText("The Jones family can steal!")).toBeVisible();

  // Jones steal with a typed answer: the matcher's suggestion is accepted with Enter.
  const answer2 = (await page.locator(".hg-answer__text").nth(1).textContent())!;
  const input = page.getByPlaceholder("Type what they said…");
  await input.fill(answer2.split("/")[0]!.toLowerCase());
  await expect(page.getByText(/Suggested: #2/)).toBeVisible();
  await input.press("Enter");

  await expect(board.getByText(/The Jones family wins \d+ points/)).toBeVisible();
  await expect(board.getByRole("listitem", { name: /^Answer 2: .+ points$/ })).toBeVisible();
  await expect(board.getByText(/^Score: [1-9]\d*$/)).toHaveCount(1); // Jones scored, Smith still 0
  await expect(page.getByText(/The Jones family wins the round/)).toBeVisible();
});

test("a whole game: four rounds, Sudden Death and the winner screen", async ({ page }) => {
  const board = await openHostAndBoard(page);
  await startGame(page);

  // Keep scores low so nobody reaches 300: win each round with answer #4 only.
  for (const [buzz, other] of [["q", "x"], ["p", "x"], ["q", "x"], ["p", "x"]] as const) {
    await press(page, "n", buzz, "4", other);
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await press(page, "x", "x", "x", "x");
    await expect(page.getByText(/wins the round/)).toBeVisible();
  }
  await expect(board.getByTestId("round-banner")).toHaveText(/TRIPLE/);

  await expect(page.getByRole("button", { name: /Start Sudden Death/ })).toBeVisible();
  await press(page, "n");
  await expect(board.getByTestId("round-banner")).toHaveText(/SUDDEN DEATH/);
  await expect(board.getByText(/only the #1 answer counts/i)).toBeVisible();

  await press(page, "q", "1");
  await expect(board.getByRole("alert")).toContainText(/smith/i);
  await expect(page.getByRole("button", { name: "Play Fast Money" })).toBeVisible();
});

test("the board joins a game already in progress", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/8,8\d\d surveys/)).toBeVisible({ timeout: 20_000 });
  await startGame(page);
  await press(page, "n", "q", "1");

  const board = await page.context().newPage();
  await board.goto("/#/board");
  await expect(board.getByRole("listitem", { name: /^Answer 1: .+ points$/ })).toBeVisible();
  await expect(board.getByRole("heading", { name: "SMITH" })).toBeVisible();
});

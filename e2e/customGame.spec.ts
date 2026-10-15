// End-to-end: write a custom question, build a question set with it, and play
// a game with that set — round 1 asks the custom question.

import { expect, test, type Page } from "@playwright/test";

const SHOTS = process.env.SHOTS_DIR;
const QUESTION = "Name something you would find in our garage.";

async function press(page: Page, ...keys: string[]) {
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  for (const key of keys) await page.keyboard.press(key);
}

test("a custom question in a saved question set is asked in round 1", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");
  await expect(page.getByText(/8,8\d\d surveys/)).toBeVisible({ timeout: 20_000 });

  // 1. Write a custom 3-answer question in the question bank.
  await page.getByRole("button", { name: "Question bank" }).click();
  await page.getByRole("button", { name: "Add custom question" }).click();
  await page.getByLabel("Question", { exact: true }).fill(QUESTION);
  const answers: [string, string][] = [["Car", "50"], ["Bikes", "30"], ["Old junk", "20"]];
  for (const [i, [text, points]] of answers.entries()) {
    await page.getByLabel(`Answer ${i + 1}`, { exact: true }).fill(text);
    await page.getByLabel(`Points for answer ${i + 1}`).fill(points);
  }
  await page.getByRole("button", { name: "Remove answer 4" }).click();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/cq-1-form.png`, fullPage: true });
  await page.getByRole("button", { name: "Save question" }).click();
  await expect(page.getByText(QUESTION).first()).toBeVisible();
  await expect(page.getByText("Custom", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Back to setup" }).first().click();

  // 2. Build a question set: the custom question first, then a show question.
  await page.getByRole("button", { name: "New set" }).click();
  await page.getByLabel("Set name").fill("Garage night");
  await page.getByRole("button", { name: "Add questions to Rounds" }).click();
  await page.getByLabel("Search questions").fill("garage");
  await page.getByRole("button", { name: `Add ${QUESTION}` }).click();
  await page.getByLabel("Search questions").fill("vacation");
  await page.getByRole("list", { name: "Search results" }).getByRole("button", { name: /^Add / }).first().click();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/cq-2-set-editor.png`, fullPage: true });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.getByRole("button", { name: "Back to setup" }).click();

  // 3. The new set is selected; start the game with it.
  await expect(page.getByLabel("Questions")).toHaveValue(/qset-/);
  await expect(page.getByLabel("Question set Garage night")).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/cq-3-setup.png`, fullPage: true });
  await page.getByRole("button", { name: "Start game" }).click();

  const board = await page.context().newPage();
  await board.setViewportSize({ width: 1280, height: 720 });
  await board.goto("/#/board");

  await press(page, "n");
  await expect(page.locator(".hg-question__text")).toHaveText(QUESTION);
  // A 3-answer board: three numbered tiles and five blanks.
  await expect(board.getByRole("listitem", { name: /hidden$/ })).toHaveCount(3);
  await press(page, "q", "1");
  await expect(board.getByRole("listitem", { name: /^Answer 1: CAR, 50 points$/i })).toBeVisible();
  if (SHOTS) await board.screenshot({ path: `${SHOTS}/cq-4-board.png` });
});

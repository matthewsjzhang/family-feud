// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { INERT_CHAMPIONS_AND_BROWSER } from "../../../app/hostStubs";
import type { GameHost } from "../../../app/useGameHost";
import type { Survey } from "../../../data/bank";
import type { UpcomingRound } from "../../../engine/mainGame";
import { PAGE_SIZE, QuestionBrowser } from "./QuestionBrowser";

function survey(id: string, question: string, answers: string[], season = 20): Survey {
  return {
    id,
    season,
    answerCount: answers.length,
    question,
    total: 100,
    answers: answers.map((text, i) => ({ text, points: 50 - i * 5 })),
    source: "https://example.test",
  };
}

const MIL = survey("mil", "Name something your mother-in-law criticizes", ["COOKING", "CLEANING", "KIDS", "HUSBAND"], 16);
const BEACH = survey("beach", "Name something people bring to the beach", ["TOWEL", "SUNSCREEN", "UMBRELLA", "COOLER", "CHAIR", "BOOK"], 18);
// Enough filler to need "Show more".
const FILLER = Array.from({ length: 70 }, (_, i) =>
  survey(`f${i}`, `Filler question number ${i}`, Array.from({ length: 4 + (i % 5) }, (_, j) => `ANSWER ${j}`), 20 + (i % 3)),
);
const MAIN = [MIL, BEACH, ...FILLER];
const SD = [survey("sd1", "Name the most popular pet", ["DOG"], 17), survey("sd2", "Name a yellow fruit", ["BANANA"], 19)];

const ROUND_2: UpcomingRound = { kind: "round", number: 2, name: "Round 2", multiplier: 2, minAnswers: 6, maxAnswers: 8 };

interface FakeOptions {
  upcoming?: UpcomingRound | null;
  used?: string[];
  onClose?: () => void;
  queueSpy?: (id: string) => void;
}

/** The browser-facing slice of GameHost, with a working queue. */
function FakeHost({ upcoming = ROUND_2, used = [], onClose = () => {}, queueSpy = () => {} }: FakeOptions) {
  const [queued, setQueued] = useState<Survey | null>(null);
  const host = {
    ...INERT_CHAMPIONS_AND_BROWSER,
    state: null,
    upcoming,
    banks: { main: MAIN, suddenDeath: SD },
    isUsed: (id: string) => used.includes(id),
    queued,
    queueSurvey(id: string) {
      queueSpy(id);
      setQueued([...MAIN, ...SD].find((s) => s.id === id) ?? null);
    },
    clearQueue: () => setQueued(null),
  } as GameHost;
  return <QuestionBrowser host={host} onClose={onClose} />;
}

function setup(options: FakeOptions = {}) {
  const user = userEvent.setup();
  const onClose = vi.fn();
  const queueSpy = vi.fn<(id: string) => void>();
  render(<FakeHost onClose={onClose} queueSpy={queueSpy} {...options} />);
  return { user, onClose, queueSpy };
}

const results = () => screen.getByRole("list", { name: "Matching surveys" });
const rows = () => within(results()).getAllByRole("button", { expanded: false }).concat(
  within(results()).queryAllByRole("button", { expanded: true }),
);
const rowButton = (name: RegExp) => within(results()).getByRole("button", { name });
const status = () => screen.getByRole("status");
const searchBox = () => screen.getByRole("searchbox", { name: /search questions and answers/i });

describe("QuestionBrowser", () => {
  it("shows both banks as tabs with counts and switches between them", async () => {
    const { user } = setup();
    const mainTab = screen.getByRole("tab", { name: /Main game/ });
    const sdTab = screen.getByRole("tab", { name: /Sudden Death/ });
    expect(mainTab).toHaveTextContent("72");
    expect(sdTab).toHaveTextContent("2");
    expect(mainTab).toHaveAttribute("aria-selected", "true");
    expect(status()).toHaveTextContent("72 surveys match");
    expect(screen.getByRole("combobox", { name: "Answers" })).toBeInTheDocument();

    await user.click(sdTab);
    expect(sdTab).toHaveAttribute("aria-selected", "true");
    expect(status()).toHaveTextContent("2 surveys match");
    expect(screen.queryByRole("combobox", { name: "Answers" })).not.toBeInTheDocument();

    // Arrow keys move between tabs.
    await user.keyboard("{ArrowLeft}");
    expect(mainTab).toHaveAttribute("aria-selected", "true");
    expect(mainTab).toHaveFocus();
  });

  it("narrows results as you type, over questions and answers", async () => {
    const { user } = setup();
    await user.type(searchBox(), "mother-in-law");
    expect(status()).toHaveTextContent("1 survey matches");
    expect(rowButton(/mother-in-law/)).toBeInTheDocument();

    await user.clear(searchBox());
    await user.type(searchBox(), "sunscreen");
    expect(rows()).toHaveLength(1);
    expect(rowButton(/beach/)).toBeInTheDocument();

    await user.type(searchBox(), " zebra");
    expect(status()).toHaveTextContent("0 surveys match");
    expect(screen.getByText(/No surveys match/)).toBeInTheDocument();
  });

  it("filters by season, answer count, played and fit", async () => {
    const { user } = setup({ used: ["beach"] });
    await user.selectOptions(screen.getByRole("combobox", { name: "Season" }), "16");
    expect(status()).toHaveTextContent("1 survey matches");
    await user.selectOptions(screen.getByRole("combobox", { name: "Season" }), "");

    await user.selectOptions(screen.getByRole("combobox", { name: "Answers" }), "6");
    // BEACH plus the 14 six-answer fillers.
    expect(status()).toHaveTextContent("15 surveys match");
    expect(within(rowButton(/beach/)).getByText("Played")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Hide already played" }));
    expect(status()).toHaveTextContent("14 surveys match");
    await user.selectOptions(screen.getByRole("combobox", { name: "Answers" }), "");

    await user.click(screen.getByRole("checkbox", { name: /Fits the next round \(Round 2, 6-8 answers\)/ }));
    // 6-8 answer fillers (42), BEACH hidden as played, MIL has 4.
    expect(status()).toHaveTextContent("42 surveys match");
  });

  it("disables the fit filter when no round is coming up", () => {
    setup({ upcoming: null });
    expect(screen.getByRole("checkbox", { name: /Fits the next round/ })).toBeDisabled();
  });

  it("renders a page at a time with Show more", async () => {
    const { user } = setup();
    expect(rows()).toHaveLength(PAGE_SIZE);
    expect(screen.getByText(`Showing ${PAGE_SIZE} of 72`)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show more" }));
    expect(rows()).toHaveLength(72);
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
  });

  it("expands a row to show every answer with points", async () => {
    const { user } = setup();
    const head = rowButton(/beach/);
    expect(head).toHaveAttribute("aria-expanded", "false");
    await user.click(head);
    expect(head).toHaveAttribute("aria-expanded", "true");
    const answers = screen.getByRole("list", { name: /Answers: Name something people bring/ });
    const items = within(answers).getAllByRole("listitem");
    expect(items).toHaveLength(6);
    expect(items[0]).toHaveTextContent("1TOWEL50");
    expect(items[5]).toHaveTextContent("BOOK25");
    await user.click(head);
    expect(head).toHaveAttribute("aria-expanded", "false");
  });

  it("queues a survey to play next and shows it at the top with Clear", async () => {
    const { user, queueSpy } = setup();
    await user.click(rowButton(/beach/));
    await user.click(screen.getByRole("button", { name: "Play this next" }));
    expect(queueSpy).toHaveBeenCalledWith("beach");
    expect(within(rowButton(/beach/)).getByText("Queued")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Queued to play next" })).toBeDisabled();
    const banner = screen.getByLabelText("Next question");
    expect(banner).toHaveTextContent("Playing next: Name something people bring to the beach");

    await user.click(within(banner).getByRole("button", { name: "Clear" }));
    expect(banner).toHaveTextContent("No question picked");
    expect(within(rowButton(/beach/)).queryByText("Queued")).not.toBeInTheDocument();
  });

  it("warns when a pick does not fit the next round but still queues it", async () => {
    const { user, queueSpy } = setup();
    await user.click(rowButton(/mother-in-law/));
    const play = screen.getByRole("button", { name: "Play this next" });
    expect(play).toBeEnabled();
    expect(play).toHaveAccessibleDescription(/Round 2 needs a 6-8 answer survey/);
    await user.click(play);
    expect(queueSpy).toHaveBeenCalledWith("mil");
    expect(screen.getByLabelText("Next question")).toHaveTextContent(/needs a 6-8 answer survey/);

    await user.click(screen.getByRole("tab", { name: /Sudden Death/ }));
    await user.click(rowButton(/popular pet/));
    expect(screen.getByRole("button", { name: "Play this next" })).toHaveAccessibleDescription(
      /Sudden Death questions only play in Sudden Death/,
    );
  });

  it("Surprise me expands a random unplayed survey matching the filters", async () => {
    const { user } = setup({ used: ["mil"] });
    await user.type(searchBox(), "mother in law");
    await user.click(screen.getByRole("button", { name: "Surprise me" }));
    expect(screen.getByText(/Every survey matching these filters has already been played/)).toBeInTheDocument();

    await user.clear(searchBox());
    await user.type(searchBox(), "beach");
    await user.click(screen.getByRole("button", { name: "Surprise me" }));
    const pick = screen.getByRole("list", { name: "Surprise pick" });
    expect(within(pick).getByRole("button", { name: /beach/ })).toHaveAttribute("aria-expanded", "true");
    expect(within(pick).getByText("TOWEL")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("list", { name: "Surprise pick" })).not.toBeInTheDocument();
  });

  it("closes with the Back button or Escape; Escape first clears a search", async () => {
    const { user, onClose } = setup();
    await user.click(screen.getByRole("button", { name: /Back to the game/ }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.type(searchBox(), "beach");
    await user.keyboard("{Escape}");
    expect(searchBox()).toHaveValue("");
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

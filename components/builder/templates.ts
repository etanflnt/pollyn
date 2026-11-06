// Quick-start templates + builder defaults. Owner: Leonardo.
import type { Option, PollInput, PollSettings, Question, QuestionType } from "@/lib/types";
import { newId } from "@/lib/ids";

export const DEFAULT_SETTINGS: PollSettings = {
  access: "org",
  resultsVisibility: "after_vote",
  showVoteCounts: true,
  showVoterNames: false,
  anonymous: false,
  closesAt: null,
  theme: "teal",
};

export const opt = (label = ""): Option => ({ id: newId("o_"), label, media: null });

export function newQuestion(type: QuestionType, title = "", labels?: string[], extra: Partial<Question> = {}): Question {
  const choice = type === "single" || type === "multiple";
  return {
    id: newId("q_"),
    type,
    title,
    description: "",
    media: null,
    required: true,
    options: choice ? (labels ?? ["", ""]).map(opt) : [],
    maxChoices: null,
    allowSuggestions: false,
    ...extra,
  };
}

export interface PollTemplate {
  key: string;
  emoji: string;
  name: string;
  blurb: string;
  build: () => PollInput;
}

export const TEMPLATES: PollTemplate[] = [
  {
    key: "lunch",
    emoji: "🍜",
    name: "Lunch run",
    blurb: "Where & when we eat",
    build: () => ({
      title: "Where's lunch today? 🍜",
      description: "Vote fast — the order goes in at 11:30. Got a better idea? Add it!",
      cover: null,
      settings: { ...DEFAULT_SETTINGS, theme: "sunset", resultsVisibility: "always" },
      questions: [
        newQuestion("single", "Where should we eat?", ["Ramen", "Pizza", "Tacos", "Poke bowls"], { allowSuggestions: true }),
        newQuestion("single", "What time works?", ["12:00", "12:30", "13:00"]),
        newQuestion("text", "Any dietary needs or cravings?", undefined, { required: false }),
      ],
    }),
  },
  {
    key: "event",
    emoji: "📅",
    name: "Team event date",
    blurb: "Find a date + activity",
    build: () => ({
      title: "Team event: pick a date 📅",
      description: "Tick every date you can make. We'll go with the most popular one.",
      cover: null,
      settings: { ...DEFAULT_SETTINGS, theme: "blue", showVoterNames: true },
      questions: [
        newQuestion("multiple", "Which dates work for you?", ["Thursday next week", "Friday next week", "Thursday in two weeks", "Friday in two weeks"]),
        newQuestion("single", "What should we do?", ["Bowling 🎳", "Karaoke 🎤", "Escape room 🔐", "Board games 🎲"], { allowSuggestions: true }),
        newQuestion("rating", "How excited are you?", undefined, { required: false }),
      ],
    }),
  },
  {
    key: "winner",
    emoji: "🏆",
    name: "Pick the winner",
    blurb: "Contests & awards",
    build: () => ({
      title: "And the winner is… 🏆",
      description: "One vote each. Results are revealed when voting closes.",
      cover: null,
      settings: { ...DEFAULT_SETTINGS, theme: "mint", resultsVisibility: "after_close", anonymous: true },
      questions: [newQuestion("single", "Which entry should win?", ["Entry A", "Entry B", "Entry C"])],
    }),
  },
  {
    key: "feedback",
    emoji: "⭐",
    name: "Quick feedback",
    blurb: "Anonymous pulse check",
    build: () => ({
      title: "How did it go? ⭐",
      description: "Two minutes, fully anonymous. Be honest — it helps!",
      cover: null,
      settings: { ...DEFAULT_SETTINGS, theme: "teal", anonymous: true, resultsVisibility: "owner_only" },
      questions: [
        newQuestion("rating", "Overall, how was it?"),
        newQuestion("single", "Would you join again?", ["Absolutely", "Maybe", "Not for me"]),
        newQuestion("text", "What should we do differently?", undefined, { required: false }),
      ],
    }),
  },
];

export const findTemplate = (key: string | null | undefined) => TEMPLATES.find((t) => t.key === key) ?? null;

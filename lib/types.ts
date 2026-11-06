// Shared contract between server (app/api, lib/server) and client (app/*, components/*).
// Owner: orchestrator. Agents: do not edit; report needed changes instead.

export type ID = string;

/* ---------------- Users ---------------- */
export type UserKind = "org" | "guest" | "dev";

export interface User {
  id: ID;            // org: AAD oid · guest: "guest_<rand>" · dev: "dev_<slug(email)>"
  kind: UserKind;
  name: string;
  email: string | null;
  tenantId: string | null; // AAD tid; dev users get "dev-org"; guests null
  isAdmin: boolean;
}

export interface AppConfig {
  authMode: "teams" | "dev";      // "dev" when AZURE_CLIENT_ID is not set
  clientId: string | null;
  tenantId: string | null;
  baseUrl: string;
}

export interface MeResponse {
  user: User | null;
  canCreate: boolean;
  config: AppConfig;
}

/* ---------------- Polls ---------------- */
export type MediaKind = "image" | "video";
export interface Media {
  kind: MediaKind;
  url: string;          // image: absolute or /api/uploads/<file>; video: the ORIGINAL url the creator pasted
  alt?: string;
}

export type QuestionType =
  | "single"    // pick one option
  | "multiple"  // pick 1..maxChoices options
  | "rating"    // 1..5 stars
  | "text";     // free text answer

export interface Option {
  id: ID;
  label: string;
  media?: Media | null;          // image only for options
  suggestedBy?: { userId: ID; name: string } | null; // set when a voter added it
}

export interface Question {
  id: ID;
  type: QuestionType;
  title: string;
  description?: string;
  media?: Media | null;          // image or video reference
  required: boolean;
  options: Option[];             // empty for rating/text
  maxChoices?: number | null;    // "multiple" only; null = unlimited
  allowSuggestions: boolean;     // single/multiple only: voters may add their own option
}

export type PollAccess = "org" | "public";      // org = same tenant sign-in required; public = anyone (guest name ok)
export type PollStatus = "draft" | "open" | "closed";
export type ResultsVisibility = "always" | "after_vote" | "after_close" | "owner_only";

export interface PollSettings {
  access: PollAccess;
  resultsVisibility: ResultsVisibility;
  showVoteCounts: boolean;   // voters can see the number of people who voted (and per-option counts when results visible)
  showVoterNames: boolean;   // results list who picked what (ignored when anonymous)
  anonymous: boolean;        // never expose names to anyone, including owner
  closesAt: string | null;   // ISO; poll auto-closes after this
  theme: "teal" | "blue" | "mint" | "sunset"; // accent for the poll cover
}

export interface Poll {
  id: ID;
  slug: string;              // short share code used in /p/<slug>
  title: string;
  description: string;
  cover: Media | null;
  ownerId: ID;
  ownerName: string;
  tenantId: string | null;   // owner's tenant; org polls only accept this tenant
  status: PollStatus;
  settings: PollSettings;
  questions: Question[];
  createdAt: string;
  updatedAt: string;
}

export interface PollSummary {
  id: ID;
  slug: string;
  title: string;
  status: PollStatus;
  access: PollAccess;
  questionCount: number;
  started: number;
  completed: number;
  updatedAt: string;
}

/** Body of POST /api/polls and PATCH /api/polls/:id (PATCH accepts any subset). */
export interface PollInput {
  title: string;
  description?: string;
  cover?: Media | null;
  status?: PollStatus;
  settings?: Partial<PollSettings>;
  questions?: Question[];    // client generates ids with newId(); server keeps them
}

/* ---------------- Responses ---------------- */
export interface Answer {
  optionIds?: ID[];   // single (length 1) / multiple
  rating?: number;    // 1..5
  text?: string;
}

export interface PollResponse {
  id: ID;
  pollId: ID;
  userId: ID;
  userName: string;
  answers: Record<ID, Answer>;  // keyed by question id
  currentStep: number;          // index of the step the voter was on (0 = intro, 1..n = question i-1, n+1 = review)
  completed: boolean;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
}

/** Body of PUT /api/polls/:id/response (autosave on every step change). */
export interface ResponseInput {
  answers: Record<ID, Answer>;
  currentStep: number;
  completed: boolean;
}

/** GET /api/polls/:idOrSlug */
export interface PollView {
  poll: Poll;
  isOwner: boolean;
  myResponse: PollResponse | null;
  canSeeResults: boolean;
  participantCount: number | null; // completed responses; null when !showVoteCounts && !isOwner
}

/* ---------------- Results ---------------- */
export interface OptionResult {
  optionId: ID;
  count: number;
  voters: string[] | null;   // names; null when anonymous or !showVoterNames (owner gets names unless anonymous)
}

export interface QuestionResult {
  questionId: ID;
  answered: number;
  options: OptionResult[];             // single/multiple
  ratingAverage: number | null;        // rating
  ratingDistribution: number[] | null; // rating: counts for 1..5 (length 5)
  texts: { text: string; name: string | null }[] | null; // text
}

export interface PollResults {
  pollId: ID;
  started: number;
  completed: number;
  /** Owner only (else null): dropOff[i] = number of unfinished responses whose currentStep === i. */
  dropOff: number[] | null;
  questions: QuestionResult[];
  generatedAt: string;
}

/* ---------------- Games (randomiser) ---------------- */
export type GameKind = "spinner" | "raffle" | "entries";
export type EntrySource = "participants" | "options" | "custom";

export interface Entry {
  label: string;
  weight: number;    // >= 1, number of tickets
}

/** POST /api/polls/:id/draws  (owner only) */
export interface DrawInput {
  game: GameKind;
  source: EntrySource;
  questionId?: ID;          // source=options: which question's options; weight = vote count (min 1)
  entries?: Entry[];        // source=custom: explicit list
  winners: number;          // how many to draw (no repeats), >=1
  bonusForSuggestions?: boolean; // source=participants: +1 ticket per suggested option
}

export interface Draw {
  id: ID;
  pollId: ID;
  game: GameKind;
  source: EntrySource;
  entries: Entry[];         // the frozen entry list used
  winners: number[];        // indexes into entries, in draw order (server-side crypto random, weighted)
  createdBy: string;
  createdAt: string;
}

/* ---------------- Errors ---------------- */
export interface ApiError {
  error: string;           // human-readable
  code: "unauthenticated" | "forbidden" | "not_found" | "bad_request" | "closed" | "wrong_tenant";
}

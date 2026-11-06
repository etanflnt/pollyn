// Results aggregation (pure). Owner: Linus.
// Tallies count COMPLETED responses only (submitted votes); unfinished ones show up in started/dropOff.
import type { Poll, PollResponse, PollResults, QuestionResult } from "../types.ts";

export interface ResultsViewer {
  isOwner: boolean;
}

/** Whether names may be shown to this viewer. */
export function namesVisible(poll: Poll, viewer: ResultsViewer): boolean {
  if (poll.settings.anonymous) return false;
  return viewer.isOwner || poll.settings.showVoterNames;
}

export function computeResults(poll: Poll, responses: PollResponse[], viewer: ResultsViewer, now = new Date()): PollResults {
  const showNames = namesVisible(poll, viewer);
  const done = responses.filter((r) => r.completed);
  const showCounts = viewer.isOwner || poll.settings.showVoteCounts;
  const steps = poll.questions.length + 2; // 0 = intro, 1..n = questions, n+1 = review

  let dropOff: number[] | null = null;
  if (viewer.isOwner) {
    dropOff = new Array<number>(steps).fill(0);
    for (const r of responses) {
      if (r.completed) continue;
      const i = Math.min(steps - 1, Math.max(0, Math.trunc(r.currentStep) || 0));
      dropOff[i]++;
    }
  }

  const questions: QuestionResult[] = poll.questions.map((q) => {
    const res: QuestionResult = {
      questionId: q.id,
      answered: 0,
      options: [],
      ratingAverage: null,
      ratingDistribution: null,
      texts: null,
    };
    if (q.type === "single" || q.type === "multiple") {
      const byOpt = new Map(q.options.map((o) => [o.id, { count: 0, voters: [] as string[] }]));
      for (const r of done) {
        const ids = r.answers[q.id]?.optionIds ?? [];
        let any = false;
        for (const id of ids) {
          const slot = byOpt.get(id);
          if (!slot) continue;
          slot.count++;
          slot.voters.push(r.userName);
          any = true;
        }
        if (any) res.answered++;
      }
      res.options = q.options.map((o) => {
        const slot = byOpt.get(o.id)!;
        return { optionId: o.id, count: slot.count, voters: showNames ? slot.voters : null };
      });
    } else if (q.type === "rating") {
      const dist = [0, 0, 0, 0, 0];
      let sum = 0;
      for (const r of done) {
        const v = r.answers[q.id]?.rating;
        if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 5) continue;
        dist[v - 1]++;
        sum += v;
        res.answered++;
      }
      res.ratingDistribution = dist;
      res.ratingAverage = res.answered ? Math.round((sum / res.answered) * 100) / 100 : null;
    } else {
      const texts: { text: string; name: string | null }[] = [];
      for (const r of done) {
        const t = r.answers[q.id]?.text;
        if (typeof t !== "string" || !t) continue;
        texts.push({ text: t, name: showNames ? r.userName : null });
        res.answered++;
      }
      res.texts = texts;
    }
    return res;
  });

  return {
    pollId: poll.id,
    started: showCounts ? responses.length : 0,
    completed: showCounts ? done.length : 0,
    dropOff,
    questions,
    generatedAt: now.toISOString(),
  };
}

import { asset, type Director, type Scene, type Step } from '../director';
import { capture } from '../shell';

export const card = (id: string, chapter: string, eyebrow: string, title: string, subtitle: string, narration: string[]): Scene => ({
  id,
  chapter,
  title: eyebrow,
  setup: async (d) => d.goto(asset('card.html', { eyebrow, title, subtitle })),
  steps: narration.map((say, i) => ({ say, holdMs: i === narration.length - 1 ? 600 : 200 })),
});

export interface TermLine {
  cmd: string;
  /** Real command to execute for output (defaults to cmd). */
  run?: string;
  /** Literal output instead of running anything (for commands that must not run, e.g. git clone). */
  output?: string;
  say: string;
  maxLines?: number;
  fresh?: boolean;
  lineMs?: number;
}

export const terminal = (id: string, chapter: string, title: string, lines: TermLine[], intro?: string): Scene => ({
  id,
  chapter,
  title,
  setup: async (d) => d.goto(asset('terminal.html')),
  steps: [
    ...(intro ? [{ say: intro } as Step] : []),
    ...lines.map<Step>((l) => {
      const output = l.output ?? capture(l.run ?? l.cmd, { maxLines: l.maxLines ?? 26, fresh: l.fresh, allowFail: true });
      return {
        say: l.say,
        do: async (d: Director) => {
          await d.page.evaluate(([cmd, out, lineMs]) => (window as unknown as { __term: { run(o: unknown): Promise<void> } }).__term.run({ cmd, output: out, lineMs }), [l.cmd, output, l.lineMs ?? 26] as const);
        },
        holdMs: 500,
      };
    }),
  ],
});

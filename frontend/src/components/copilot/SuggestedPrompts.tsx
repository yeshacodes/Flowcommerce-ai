import { SUGGESTED_PROMPTS } from '../../types/copilot'

/** Left-hand suggested questions. Clicking one submits it as a query. */
export default function SuggestedPrompts({ onPick, disabled }: { onPick: (q: string) => void; disabled?: boolean }) {
  return (
    <div>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-ash">Suggested questions</h2>
      <div className="space-y-1.5">
        {SUGGESTED_PROMPTS.map(p => (
          <button
            key={p}
            onClick={() => onPick(p)}
            disabled={disabled}
            className="block w-full rounded-tile border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left text-[13px] text-white/75 transition-colors hover:border-ember/40 hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  )
}

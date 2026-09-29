import './_group.css';

export function HighContrast() {
  return (
    <main className="ras-set-total-preview flex min-h-[300px] items-center justify-center bg-[#f3f6f2] p-5 text-slate-900">
      <section className="w-full max-w-[440px] rounded-2xl border border-[#d6e2db] bg-[#fffefa] p-4 shadow-lg">
        <div className="mb-3">
          <h1 className="text-lg font-black text-slate-900">Set total for Ladybugs</h1>
          <p className="mt-1 text-xs font-semibold text-slate-500">Applies immediately</p>
        </div>
        <div className="rounded-2xl border border-cyan-500/35 bg-[#f0f9f6] p-3">
          <label htmlFor="readable-total" className="mb-1 block text-xs font-bold text-[#286d65]">
            Set group total
          </label>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <input
              id="readable-total"
              disabled
              placeholder="Current total: 840"
              className="min-w-0 rounded-xl border border-[#b8d5cd] bg-white px-3 py-2 text-sm text-[#264c47] placeholder:text-[#81948c]"
            />
            <button
              type="button"
              disabled
              aria-label="Set Ladybugs total"
              className="min-h-[44px] min-w-[6.25rem] whitespace-nowrap rounded-xl border border-slate-500 bg-slate-600 px-3 py-2.5 text-sm font-extrabold text-white shadow-sm transition-colors active:scale-[.98] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 disabled:cursor-not-allowed disabled:border-slate-500 disabled:bg-slate-600 disabled:text-white disabled:opacity-100 disabled:hover:border-slate-500 disabled:hover:bg-slate-600 disabled:hover:text-white border-cyan-300 bg-cyan-400 text-slate-950 hover:bg-cyan-300 focus-visible:ring-cyan-400"
            >
              Set total
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
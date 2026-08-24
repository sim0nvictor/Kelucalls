export default function Loading() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10 lg:px-8" aria-busy="true">
      <div className="space-y-3 border-b border-white/10 pb-7">
        <div className="h-3 w-28 animate-pulse rounded bg-white/10" />
        <div className="h-9 w-72 animate-pulse rounded bg-white/10" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded bg-white/[0.06]" />
      </div>
      {["w-40", "w-32", "w-48"].map((width, index) => (
        <section key={index} className="overflow-hidden rounded-lg border border-white/10 bg-slate-950/35">
          <div className="border-b border-white/10 bg-white/[0.03] p-4">
            <div className={`h-4 ${width} animate-pulse rounded bg-white/10`} />
          </div>
          <div className="divide-y divide-white/[0.07]">
            {[1, 2, 3, 4].map((row) => (
              <div key={row} className="grid grid-cols-4 gap-4 p-4">
                <div className="h-4 animate-pulse rounded bg-white/[0.06]" />
                <div className="h-4 animate-pulse rounded bg-white/[0.06]" />
                <div className="h-4 animate-pulse rounded bg-white/[0.06]" />
                <div className="h-4 animate-pulse rounded bg-white/[0.06]" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

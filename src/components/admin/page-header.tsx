import { Badge } from "@/components/ui/badge";

export function AdminPageHeader({
  badge,
  title,
  description,
  aside
}: {
  badge: string;
  title: string;
  description: string;
  aside?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-6 rounded-[2rem] border border-white/10 bg-[#0b1628]/85 p-6 shadow-[0_24px_120px_rgba(3,8,24,0.4)] sm:p-8 xl:flex-row xl:items-end xl:justify-between">
      <div className="space-y-3">
        <Badge className="border-emerald-400/20 bg-emerald-400/10 text-emerald-200">{badge}</Badge>
        <div>
          <h1 className="text-3xl font-semibold text-white sm:text-4xl">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-400">{description}</p>
        </div>
      </div>
      {aside ? <div className="flex flex-wrap gap-3">{aside}</div> : null}
    </section>
  );
}

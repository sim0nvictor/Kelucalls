import { Card, CardContent } from "@/components/ui/card";

export function AdminStatCard({
  label,
  value,
  helper
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <Card className="border-white/8 bg-[#0a1323]/80">
      <CardContent className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</div>
        <div className="text-3xl font-semibold text-white">{value}</div>
        {helper ? <div className="text-sm text-slate-400">{helper}</div> : null}
      </CardContent>
    </Card>
  );
}

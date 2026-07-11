import { signOutAdminAction } from "@/app/kx-admin/actions";
import { AdminSidebar } from "@/components/admin/sidebar";
import { Button } from "@/components/ui/button";
import { requireAdminIdentity } from "@/lib/admin/auth";

export default async function ProtectedAdminLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const identity = await requireAdminIdentity();

  return (
    <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-6 px-4 py-6 sm:px-6 xl:flex-row xl:px-8">
      <AdminSidebar />
      <div className="flex-1 space-y-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-[#091223]/88 px-6 py-4 shadow-[0_20px_100px_rgba(2,6,23,0.45)] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Admin session
            </div>
            <div className="mt-1 text-lg font-semibold text-white">
              {identity.fullName || identity.email || "Kelucalls admin"}
            </div>
            <div className="text-sm text-slate-400">{identity.role.replace("_", " ")}</div>
          </div>
          <form action={signOutAdminAction}>
            <Button type="submit" variant="secondary">
              Sign out
            </Button>
          </form>
        </div>
        {children}
      </div>
    </div>
  );
}

import { redirect } from "next/navigation";

import { loginAdmin } from "@/app/admin/actions";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type LoginPageProps = {
  searchParams: Promise<{ next?: string; error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next, error } = await searchParams;
  const authenticated = await isAdminAuthenticated();

  if (authenticated) {
    redirect(next || "/admin");
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-10rem)] max-w-7xl items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Badge>Protected admin</Badge>
            <div>
              <h1 className="text-3xl font-semibold text-white">Admin login</h1>
              <p className="mt-2 text-sm leading-7 text-slate-400">
                Public users never authenticate. This login only protects the moderation and data
                override surface.
              </p>
            </div>
          </div>

          {error === "invalid" ? (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
              Invalid admin credentials.
            </div>
          ) : null}

          <form action={loginAdmin} className="space-y-4">
            <input type="hidden" name="nextUrl" value={next || "/admin"} />
            <input
              name="username"
              placeholder="Admin username"
              className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none focus:border-cyan-400/40"
            />
            <input
              name="password"
              type="password"
              placeholder="Admin password"
              className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none focus:border-cyan-400/40"
            />
            <Button type="submit" className="w-full">
              Sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

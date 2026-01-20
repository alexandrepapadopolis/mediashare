// app/routes/_index.tsx
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { getUserId } from "../utils/session.server";

type LoaderData = {
  isAuthenticated: boolean;
};

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await getUserId(request);
  return json<LoaderData>({
    isAuthenticated: Boolean(userId),
  });
}

export default function LandingPage() {
  const { isAuthenticated } = useLoaderData<LoaderData>();

  return (
    <main className="min-h-screen bg-background">
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="grid gap-12 md:grid-cols-2 md:items-center">
          {/* Texto principal */}
          <div className="space-y-6">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
              Phosio
            </h1>

            <p className="text-lg text-muted-foreground">
              Organize, catalogue e compartilhe seus acervos de fotos e vídeos
              com segurança, tags inteligentes e controle total.
            </p>

            <div className="flex flex-wrap gap-3">
              {isAuthenticated ? (
                <Link
                  to="/app"
                  className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  Ir para o app
                </Link>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90"
                  >
                    Entrar
                  </Link>

                  <Link
                    to="/signup"
                    className="inline-flex h-11 items-center justify-center rounded-lg border px-6 text-sm font-medium hover:bg-muted"
                  >
                    Criar conta
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Placeholder visual */}
          <div className="relative hidden md:block">
            <div className="aspect-video rounded-2xl border bg-muted/40" />
          </div>
        </div>
      </section>
    </main>
  );
}

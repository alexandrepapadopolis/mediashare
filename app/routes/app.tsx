// app/routes/app.tsx
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, Outlet, useLoaderData } from "@remix-run/react";
import { destroySession, getAccessToken, getSession, getUserId } from "../utils/session.server";

type LoaderData = {
  userId: string | null;
};

export async function loader({ request }: LoaderFunctionArgs) {
  const token = await getAccessToken(request);
  if (!token) return redirect("/login");

  const userId = await getUserId(request);
  return json<LoaderData>({ userId });
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  if (intent === "logout") {
    const session = await getSession(request.headers.get("Cookie"));
    return redirect("/", {
      headers: { "Set-Cookie": await destroySession(session) },
    });
  }

  return json({ ok: true });
}

export default function AppRoute() {
  const { userId } = useLoaderData<LoaderData>();

  return (
    <div className="min-h-screen">
      <header className="border-b bg-white/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground grid place-items-center font-bold">
              P
            </div>
            <div className="leading-tight">
              <div className="text-lg font-semibold">Phosio</div>
              <div className="text-xs text-muted-foreground">
                {userId ? `user: ${userId.slice(0, 8)}…` : "autenticado"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-muted"
            >
              Landing
            </Link>
            <Form method="post">
              <input type="hidden" name="intent" value="logout" />
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Sair
              </button>
            </Form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}

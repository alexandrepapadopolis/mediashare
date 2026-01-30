// app/routes/app.media.$id.zip.ts
import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

import { getSession, destroySession } from "../utils/session.server";

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function buildZipHeaders(args: { mediaId: string }): Headers {
  const headers = new Headers();
  headers.set("Content-Type", "application/zip");
  headers.set(
    "Content-Disposition",
    `attachment; filename="${args.mediaId}.zip"`
  );

  // Opcional, mas ajuda a evitar buffering por proxies.
  headers.set("Cache-Control", "no-store");

  return headers;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const id = params.id;

  if (!id || !isValidUuid(id)) {
    throw new Response("Invalid id", { status: 400 });
  }

  const cookieHeader = request.headers.get("Cookie");
  const session = await getSession(cookieHeader);

  const accessToken = session.get("accessToken") ?? null;
  if (!accessToken) {
    return redirect("/login", {
      headers: {
        "Set-Cookie": await destroySession(session),
      },
    });
  }

  // ESQUELETO: por enquanto não gera zip real.
  // A ideia é validar rota, auth e download no browser/curl sem depender do archiver ainda.
  const body = `ZIP placeholder for media ${id}\n`;

  return new Response(body, {
    status: 200,
    headers: buildZipHeaders({ mediaId: id }),
  });
}

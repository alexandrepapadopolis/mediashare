// app/routes/env.js.ts

import { type LoaderFunctionArgs } from "@remix-run/node";
import { getPublicEnv } from "../utils/env.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const env = getPublicEnv();

  const body = `window.__ENV = ${JSON.stringify(env)};`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      // evita cache agressivo em dev; em prod você pode ajustar
      "Cache-Control": "no-store",
    },
  });
}

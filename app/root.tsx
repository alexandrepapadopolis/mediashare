// app/root.tsx

import { type LinksFunction } from "@remix-run/node";
import { Links, LiveReload, Meta, Outlet, Scripts, ScrollRestoration } from "@remix-run/react";

import tailwindStylesheetUrl from "./tailwind.css";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: tailwindStylesheetUrl },
];

export default function App() {
  const isProd = process.env.NODE_ENV === "production";

  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <script src="/env.js"></script>
        <Scripts />
        {!isProd ? <LiveReload /> : null}
      </body>
    </html>
  );
}

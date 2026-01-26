import type { EntryContext } from "@remix-run/node";
import { PassThrough } from "node:stream";
import { randomBytes } from "node:crypto";
import { renderToPipeableStream } from "react-dom/server";
import { RemixServer } from "@remix-run/react";

import { getPublicEnv } from "./utils/env.server";

function buildCsp(args: { nonce: string; env: { SUPABASE_URL: string } }) {
  const isProd = process.env.NODE_ENV === "production";
  const supabaseUrl = args.env.SUPABASE_URL;

  const connectSrc = isProd
    ? ["'self'", supabaseUrl, "https:"]
    : ["'self'", supabaseUrl, "http:", "https:", "ws:", "wss:"];

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob: https: http:",
    "media-src 'self' blob: https: http:",
    "font-src 'self' data: https:",
    "style-src 'self' 'unsafe-inline'",
    isProd
    ? `script-src 'self' 'nonce-${args.nonce}'`
    : `script-src 'self' 'unsafe-inline' 'unsafe-eval'`,
    `connect-src ${connectSrc.join(" ")}`,
  ];

  if (isProd) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

export default function handleRequest(
  request: Request,
  statusCode: number,
  headers: Headers,
  context: EntryContext
) {
  const nonce = randomBytes(16).toString("base64");
  const ENV = getPublicEnv();

  headers.set("Content-Security-Policy", buildCsp({ nonce, env: ENV }));
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=(), payment=(), usb=()"
  );

  return new Promise<Response>((resolve, reject) => {
    let didError = false;

    const { pipe, abort } = renderToPipeableStream(
      <RemixServer context={context} url={request.url} nonce={nonce} />,
      {
        nonce, // <= CRÍTICO: adiciona nonce nos scripts de streaming ($RC etc.)
        onShellReady() {
          const body = new PassThrough();
          headers.set("Content-Type", "text/html; charset=utf-8");
          resolve(
            new Response(body as unknown as BodyInit, {
              status: didError ? 500 : statusCode,
              headers,
            })
          );
          pipe(body);
        },
        onShellError(err) {
          reject(err);
        },
        onError(err) {
          didError = true;
          console.error(err);
        },
      }
    );

    setTimeout(abort, 10_000);
  });
}

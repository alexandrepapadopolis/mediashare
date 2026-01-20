/** @type {import('@remix-run/dev').AppConfig} */
module.exports = {
  appDirectory: "app",
  ignoredRouteFiles: ["**/.*"],

  // Garante que o build do servidor é CommonJS
  serverModuleFormat: "cjs",
  serverBuildFile: "index.js",

  future: {
    v3_fetcherPersist: true,
    v3_lazyRouteDiscovery: true,
    v3_relativeSplatPath: true,
    v3_singleFetch: true,
    v3_throwAbortReason: true,
  },
};

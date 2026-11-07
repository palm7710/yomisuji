import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "yomisuji",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-11-07",
    compatibilityFlags: ["nodejs_compat"],
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ASSETS: bindings.assets(),
          SITE_URL: bindings.text("https://yomisuji.241it002i.workers.dev"),
    },
  }),
});

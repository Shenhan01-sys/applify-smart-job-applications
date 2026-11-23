import type { BrowserContext, ConsoleMessage, Page } from "@playwright/test";

/**
 * Penjaga lalu lintas. Semua permintaan peramban ke host selain 127.0.0.1 atau localhost dibatalkan di peramban
 * (tidak pernah keluar dari mesin) dan dicatat; tes GAGAL bila ada yang tercatat (assertClean).
 *
 * Satu pengecualian yang disebut terang-terangan: index.html memuat CSS font dari fonts.googleapis.com dan
 * fonts.gstatic.com. Itu perilaku produk (bukan panggilan data), jadi permintaan ke dua host itu juga dibatalkan
 * tetapi hanya dicatat sebagai `tolerated`, bukan kegagalan. Host lain, atau metode selain GET, tetap gagal.
 */
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const TOLERATED_FONT_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);

export interface SeenRequest {
  method: string;
  url: string;
  postData: string | null;
}

export class OfflineGuard {
  /** Permintaan ke host non-lokal yang dibatalkan dan membuat tes gagal. */
  readonly blocked: string[] = [];
  /** Permintaan font eksternal yang dibatalkan tanpa membuat tes gagal. */
  readonly tolerated: string[] = [];
  /** Semua permintaan yang dilihat peramban (lokal maupun tidak), untuk pemeriksaan kebocoran. */
  readonly requests: SeenRequest[] = [];
  readonly consoleMessages: string[] = [];
  readonly pageErrors: string[] = [];
  /** Setiap alamat yang pernah dipakai bingkai utama. */
  readonly navigations: string[] = [];

  async install(context: BrowserContext, page: Page): Promise<void> {
    // Didaftarkan lebih dulu daripada tiruan backend: route yang tidak ditangani tiruan (fallback) jatuh ke sini.
    await context.route("**/*", async (route) => {
      const request = route.request();
      let url: URL;
      try {
        url = new URL(request.url());
      } catch {
        this.blocked.push(`${request.method()} ${request.url()} (alamat tidak terbaca)`);
        await route.abort("blockedbyclient");
        return;
      }
      if (url.protocol === "ws:" || url.protocol === "wss:" || LOCAL_HOSTS.has(url.hostname)) {
        await route.continue();
        return;
      }
      if (TOLERATED_FONT_HOSTS.has(url.hostname) && request.method() === "GET") {
        this.tolerated.push(request.url());
      } else {
        this.blocked.push(`${request.method()} ${request.url()}`);
      }
      await route.abort("blockedbyclient");
    });

    page.on("request", (request) => {
      this.requests.push({ method: request.method(), url: request.url(), postData: request.postData() });
    });
    page.on("console", (msg: ConsoleMessage) => {
      this.consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
    });
    page.on("pageerror", (err) => {
      this.pageErrors.push(String(err?.message ?? err));
    });
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) this.navigations.push(frame.url());
    });
  }

  /** Permintaan yang isi atau alamatnya memuat `secret`. */
  requestsContaining(secret: string): { inUrl: SeenRequest[]; inBody: SeenRequest[] } {
    return {
      inUrl: this.requests.filter((r) => r.url.includes(secret) || r.url.includes(encodeURIComponent(secret))),
      inBody: this.requests.filter((r) => (r.postData ?? "").includes(secret)),
    };
  }
}

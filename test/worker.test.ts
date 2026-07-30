import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  app,
  eventNames,
  scheduled,
  validHttpsUrl,
  validListingInput,
  type Bindings,
} from "../src/worker";

const pathOf = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));
const migrationPath = pathOf("../migrations/0001_listings.sql");
const workerPath = pathOf("../src/worker.tsx");
const stylesPath = pathOf("../public/styles.css");
const commonPath = pathOf("../public/common.js");
const appPath = pathOf("../public/app.js");
const directoryPath = pathOf("../public/directory.js");
const listingPath = pathOf("../public/listing.js");
const editPath = pathOf("../public/edit.js");
const serviceWorkerPath = pathOf("../public/sw.js");
const manifestPath = pathOf("../public/manifest.webmanifest");
const robotsPath = pathOf("../public/robots.txt");
const ogPath = pathOf("../public/og.png");
const metricsPath = pathOf("../ops/product-metrics.sql");
const origin = "https://nakama-fuda.yhay81.com";
const requestOrigin = "http://localhost";
const primarySession = "a2d0e2f2-66fd-4fd4-8e87-b0ef67ad194a";

const session = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const plusDays = (count: number) =>
  new Date(Date.now() + count * 86400000).toISOString().slice(0, 10);

const listing = {
  activityTime: "evening" as const,
  applicationUrl: "https://example.com/groups/night-explorers",
  beginners: true,
  description: "平日の夜と週末に、寄り道もしながら一緒に遊びます。",
  expiresOn: plusDays(30),
  frequency: "weekly" as const,
  gameName: "星渡りの旅",
  groupName: "夜ふかし探検隊",
  groupSize: 8,
  headline: "社会人中心、週末の夜にゆっくり遊びます",
  openSeats: 3,
  platform: "crossplay" as const,
  serverName: "サーバー2",
  styles: ["casual", "social"] as const,
  trial: true,
  vc: "optional" as const,
};

let miniflare: Miniflare;
let bindings: Bindings;

type RequestOptions = {
  capability?: string;
  contentLength?: number;
  contentType?: string;
  method?: string;
  origin?: string;
  qa?: boolean;
  reporterIp?: string;
  session?: string;
};

const jsonRequest = (body: unknown, options: RequestOptions = {}): RequestInit => {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const headers: Record<string, string> = {
    "content-length": String(options.contentLength ?? new TextEncoder().encode(raw).byteLength),
    "content-type": options.contentType ?? "application/json",
    origin: options.origin ?? requestOrigin,
    "x-nakama-fuda-qa": options.qa ? "1" : "0",
    "x-nakama-fuda-session": options.session ?? primarySession,
  };
  if (options.capability) headers["x-nakama-fuda-capability"] = options.capability;
  if (options.reporterIp) headers["cf-connecting-ip"] = options.reporterIp;
  return { body: raw, headers, method: options.method ?? "POST" };
};

const capabilityRequest = (
  capability: string,
  options: Pick<RequestOptions, "method" | "qa" | "session"> = {},
): RequestInit => ({
  headers: {
    "x-nakama-fuda-capability": capability,
    "x-nakama-fuda-qa": options.qa ? "1" : "0",
    "x-nakama-fuda-session": options.session ?? primarySession,
  },
  method: options.method ?? "GET",
});

const createListing = async (
  options: { input?: Record<string, unknown>; qa?: boolean; session?: string } = {},
) => {
  const response = await app.request(
    "/api/listings",
    jsonRequest(options.input ?? listing, { qa: options.qa, session: options.session }),
    bindings,
  );
  expect(response.status, await response.clone().text()).toBe(201);
  const payload = await response.json<{
    editUrl: string;
    listingId: string;
    publicUrl: string;
    slug: string;
  }>();
  return {
    capability: new URL(payload.editUrl).hash.slice(1),
    id: payload.listingId,
    payload,
    slug: payload.slug,
  };
};

const reportListing = (
  slug: string,
  reporterSession: string,
  options: { qa?: boolean; reason?: string; reporterIp?: string } = {},
) =>
  app.request(
    `/api/listings/${slug}/report`,
    jsonRequest(
      { reason: options.reason ?? "spam" },
      {
        qa: options.qa,
        reporterIp:
          options.reporterIp ?? `203.0.113.${Math.max(1, Number(reporterSession.slice(-3)) % 255)}`,
        session: reporterSession,
      },
    ),
    bindings,
  );

beforeEach(async () => {
  miniflare = new Miniflare({
    d1Databases: { DB: "nakama-fuda-test" },
    modules: true,
    script: "export default { fetch() { return new Response('test') } }",
  });
  const database = await miniflare.getD1Database("DB");
  const migration = await readFile(migrationPath, "utf8");
  for (const statement of migration
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)) {
    await database.prepare(statement).run();
  }
  bindings = {
    ASSETS: { fetch: async () => new Response("asset", { status: 200 }) } as unknown as Fetcher,
    DB: database as unknown as D1Database,
    REPORT_HASH_KEY: "test-report-hmac-key-000000000000000000000000000000000000",
  };
});

afterEach(async () => {
  await miniflare.dispose();
});

describe("public pages", () => {
  it.each([
    ["/", 'class="recruit-desk"', `${origin}/`],
    ["/guide", "条件を先に並べる", `${origin}/guide`],
    ["/privacy", "連絡先を札に書かない", `${origin}/privacy`],
  ])("%s は製品固有の画面を返す", async (path, marker, canonical) => {
    const response = await app.request(path, undefined, bindings);
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain(marker);
    expect(body).toContain(`href="${canonical}" rel="canonical"`);
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("content-security-policy")).toContain("style-src 'self'");
    expect(response.headers.get("content-security-policy")).not.toContain("unsafe-inline");
    expect(response.headers.get("permissions-policy")).toContain("camera=()");
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/i);
    expect(body).not.toMatch(/成功条件|市場スコア|公開実験|収益性|技術選定/);
  });

  it("募集卓・活動時計・条件札・空席で用途を示す", async () => {
    const body = await (await app.request("/", undefined, bindings)).text();
    for (const marker of [
      'class="seat seat-open"',
      'class="condition-card card-game"',
      'class="condition-card card-style"',
      'class="condition-card card-vc"',
      'class="demo-board"',
    ]) {
      expect(body).toContain(marker);
    }
    expect(body).toContain("遊び方の合う席へ。");
    expect(body).toContain('src="/app.js" type="module"');
  });

  it("空の公開一覧はフィルターと空状態を返す", async () => {
    const response = await app.request("/list", undefined, bindings);
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toContain("空いている席を探す");
    expect(body).toContain("条件に合う募集はありません");
    expect(body).toContain('src="/directory.js" type="module"');
  });

  it("編集画面はnoindexで、未知の画面は製品固有404", async () => {
    const edit = await app.request("/edit/AbcdEfgh_123", undefined, bindings);
    const body = await edit.text();
    expect(edit.status).toBe(200);
    expect(edit.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(body).toContain('content="noindex,nofollow" name="robots"');
    expect((await app.request("/edit/short", undefined, bindings)).status).toBe(404);
    const missing = await app.request("/missing", undefined, bindings);
    expect(missing.status).toBe(404);
    expect(await missing.text()).toContain("その募集卓は、閉じています");
  });

  it("healthは報告機能の状態を示しキャッシュしない", async () => {
    const response = await app.request("/health", undefined, bindings);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, reporting: true });
    const unavailable = await app.request("/health", undefined, {
      ...bindings,
      REPORT_HASH_KEY: undefined,
    });
    expect(await unavailable.json()).toEqual({ ok: true, reporting: false });
  });
});

describe("input validation", () => {
  it("安全な募集とHTTPS応募先を許可する", () => {
    expect(validListingInput(listing)).toBe(true);
    expect(validHttpsUrl("https://example.com:443/apply?from=directory")).toBe(true);
  });

  it.each([
    "http://example.com/apply",
    "https://user:pass@example.com/apply",
    "https://example.com:444/apply",
    "https://localhost/apply",
    "https://service.local/apply",
    "https://service.internal/apply",
    "https://127.0.0.1/apply",
    "https://0.0.0.0/apply",
    "https://[::1]/apply",
    "not-a-url",
  ])("危険な応募先 %s を拒否する", (url) => {
    expect(validHttpsUrl(url)).toBe(false);
    expect(validListingInput({ ...listing, applicationUrl: url })).toBe(false);
  });

  it.each([
    ["gameName", ""],
    ["gameName", "a".repeat(61)],
    ["groupName", " 余白"],
    ["headline", "https://example.com"],
    ["description", "連絡は test@example.com へ"],
    ["description", "a".repeat(501)],
    ["serverName", "a".repeat(41)],
    ["platform", "console"],
    ["activityTime", "midnight"],
    ["frequency", "daily"],
    ["vc", "sometimes"],
    ["groupSize", 0],
    ["groupSize", 1000],
    ["openSeats", 0],
    ["openSeats", 101],
    ["styles", []],
    ["styles", ["casual", "casual"]],
    ["styles", ["casual", "social", "battle", "events", "support", "roleplay"]],
    ["styles", ["unknown"]],
    ["beginners", "yes"],
    ["trial", 1],
    ["expiresOn", plusDays(6)],
    ["expiresOn", plusDays(91)],
  ])("%s の不正値を拒否する", (key, value) => {
    expect(validListingInput({ ...listing, [key]: value })).toBe(false);
  });

  it("余分なキーと欠けたキーを拒否する", () => {
    expect(validListingInput({ ...listing, extra: true })).toBe(false);
    const { trial: _trial, ...missing } = listing;
    expect(validListingInput(missing)).toBe(false);
  });
});

describe("listing lifecycle and directory", () => {
  it("ハッシュ化した編集鍵と公開URLを発行する", async () => {
    const created = await createListing();
    expect(created.slug).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(created.capability).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(created.payload.publicUrl).toBe(`${requestOrigin}/r/${created.slug}`);
    const row = await bindings.DB.prepare(
      "SELECT capability_hash, status FROM listings WHERE id = ?",
    )
      .bind(created.id)
      .first<{ capability_hash: string; status: string }>();
    expect(row?.capability_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.capability_hash).not.toContain(created.capability);
    expect(row?.status).toBe("active");
  });

  it("正しい編集鍵だけで取得できる", async () => {
    const created = await createListing();
    const response = await app.request(
      `/api/listings/${created.slug}`,
      capabilityRequest(created.capability),
      bindings,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const payload = await response.json<{ listing: typeof listing; status: string }>();
    expect(payload.listing.gameName).toBe(listing.gameName);
    expect(payload.status).toBe("active");
    expect(
      (
        await app.request(
          `/api/listings/${created.slug}`,
          capabilityRequest("A".repeat(43)),
          bindings,
        )
      ).status,
    ).toBe(404);
  });

  it("公開詳細を検索可能なHTMLとして返し、入力をエスケープする", async () => {
    const created = await createListing({
      input: {
        ...listing,
        description: "安全に遊ぶ <script>alert(1)</script>",
        groupName: "夜ふかし <b>探検隊</b>",
      },
    });
    const response = await app.request(`/r/${created.slug}`, undefined, bindings);
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toContain("夜ふかし &lt;b&gt;探検隊&lt;/b&gt;");
    expect(body).not.toContain("<script>alert(1)</script>");
    expect(body).toContain('rel="noopener noreferrer"');
    expect(body).toContain('src="/listing.js" type="module"');
    expect(body).not.toContain("noindex");
  });

  it("検索・機種・時間・VC・初心者条件で一覧を絞り、選択を保持する", async () => {
    const created = await createListing();
    const matched = await app.request(
      "/list?q=%E6%98%9F%E6%B8%A1%E3%82%8A&platform=crossplay&time=evening&vc=optional&beginners=1",
      undefined,
      bindings,
    );
    const body = await matched.text();
    expect(body).toContain(`/r/${created.slug}`);
    expect(body).toContain('selected="" value="crossplay"');
    expect(body).toContain('selected="" value="evening"');
    expect(body).toContain('selected="" value="optional"');
    expect(body).toContain('checked="" name="beginners"');
    const missed = await app.request("/list?platform=mobile", undefined, bindings);
    expect(await missed.text()).not.toContain(`/r/${created.slug}`);
  });

  it("更新で内容を変え、閉じた募集も再公開する", async () => {
    const created = await createListing();
    expect(
      (
        await app.request(
          `/api/listings/${created.slug}/close`,
          jsonRequest({}, { capability: created.capability }),
          bindings,
        )
      ).status,
    ).toBe(200);
    expect((await app.request(`/r/${created.slug}`, undefined, bindings)).status).toBe(404);
    const updated = { ...listing, headline: "平日21時から、体験参加できます", openSeats: 2 };
    const response = await app.request(
      `/api/listings/${created.slug}`,
      jsonRequest(updated, { capability: created.capability, method: "PUT" }),
      bindings,
    );
    expect(response.status).toBe(200);
    expect((await app.request(`/r/${created.slug}`, undefined, bindings)).status).toBe(200);
    const row = await bindings.DB.prepare(
      "SELECT headline, open_seats, status FROM listings WHERE id = ?",
    )
      .bind(created.id)
      .first<{ headline: string; open_seats: number; status: string }>();
    expect(row).toMatchObject({ headline: updated.headline, open_seats: 2, status: "active" });
  });

  it("終了は一覧とサイトマップから外す", async () => {
    const created = await createListing();
    const response = await app.request(
      `/api/listings/${created.slug}/close`,
      jsonRequest({}, { capability: created.capability }),
      bindings,
    );
    expect(response.status).toBe(200);
    expect(await (await app.request("/list", undefined, bindings)).text()).not.toContain(
      created.slug,
    );
    expect(await (await app.request("/sitemap.xml", undefined, bindings)).text()).not.toContain(
      created.slug,
    );
  });

  it("削除は元データを消し、削除イベントだけ残す", async () => {
    const created = await createListing();
    const response = await app.request(
      `/api/listings/${created.slug}`,
      capabilityRequest(created.capability, { method: "DELETE" }),
      bindings,
    );
    expect(response.status).toBe(204);
    expect(
      await bindings.DB.prepare("SELECT COUNT(*) AS count FROM listings").first<{
        count: number;
      }>(),
    ).toEqual({ count: 0 });
    const deleted = await bindings.DB.prepare(
      "SELECT COUNT(*) AS count FROM product_events WHERE name = 'listing_deleted'",
    ).first<{ count: number }>();
    expect(deleted?.count).toBe(1);
  });

  it("同じセッションの作成を1日2件に制限する", async () => {
    await createListing();
    await createListing();
    const response = await app.request("/api/listings", jsonRequest(listing), bindings);
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "daily_limit" });
    expect((await createListing({ session: session(99) })).payload.publicUrl).toMatch(
      /^http:\/\/localhost\/r\//,
    );
  });

  it.each([
    ["他オリジン", { origin: "https://evil.example" }, 400],
    ["別content-type", { contentType: "text/plain" }, 400],
    ["過大content-length", { contentLength: 9000 }, 400],
    ["不正セッション", { session: "not-a-session" }, 400],
  ])("%s の作成要求を拒否する", async (_label, options, expected) => {
    const response = await app.request(
      "/api/listings",
      jsonRequest(listing, options as RequestOptions),
      bindings,
    );
    expect(response.status).toBe(expected);
  });

  it("壊れたJSONと余分なイベント項目を拒否する", async () => {
    const invalidJson = await app.request("/api/listings", jsonRequest("{"), bindings);
    expect(invalidJson.status).toBe(400);
    const invalidEvent = await app.request(
      "/api/events",
      jsonRequest({ extra: true, listingId: "", name: "visited" }),
      bindings,
    );
    expect(invalidEvent.status).toBe(400);
  });
});

describe("reporting and events", () => {
  it("同じセッションと同じネットワークの重複報告を数えない", async () => {
    const created = await createListing();
    expect(
      (await reportListing(created.slug, session(1), { reporterIp: "203.0.113.20" })).status,
    ).toBe(202);
    expect(
      (await reportListing(created.slug, session(1), { reporterIp: "203.0.113.21" })).status,
    ).toBe(202);
    expect(
      (await reportListing(created.slug, session(2), { reporterIp: "203.0.113.20" })).status,
    ).toBe(202);
    const row = await bindings.DB.prepare("SELECT report_count, status FROM listings WHERE id = ?")
      .bind(created.id)
      .first<{ report_count: number; status: string }>();
    expect(row).toEqual({ report_count: 1, status: "active" });
  });

  it("独立した3件の報告で非表示にする", async () => {
    const created = await createListing();
    for (let index = 1; index <= 3; index += 1) {
      const response = await reportListing(created.slug, session(index), {
        reporterIp: `203.0.113.${index}`,
      });
      const payload = await response.json<{ hidden: boolean }>();
      expect(payload.hidden).toBe(index === 3);
    }
    expect((await app.request(`/r/${created.slug}`, undefined, bindings)).status).toBe(404);
    const row = await bindings.DB.prepare("SELECT report_count, status FROM listings WHERE id = ?")
      .bind(created.id)
      .first<{ report_count: number; status: string }>();
    expect(row).toEqual({ report_count: 3, status: "hidden" });
  });

  it("更新は報告を消し、安全に再公開する", async () => {
    const created = await createListing();
    for (let index = 1; index <= 3; index += 1) {
      await reportListing(created.slug, session(index), { reporterIp: `198.51.100.${index}` });
    }
    const response = await app.request(
      `/api/listings/${created.slug}`,
      jsonRequest(
        { ...listing, headline: "内容を見直しました" },
        {
          capability: created.capability,
          method: "PUT",
        },
      ),
      bindings,
    );
    expect(response.status).toBe(200);
    const row = await bindings.DB.prepare("SELECT report_count, status FROM listings WHERE id = ?")
      .bind(created.id)
      .first<{ report_count: number; status: string }>();
    expect(row).toEqual({ report_count: 0, status: "active" });
    expect(
      await bindings.DB.prepare("SELECT COUNT(*) AS count FROM listing_reports").first<{
        count: number;
      }>(),
    ).toEqual({ count: 0 });
  });

  it("報告機能が未設定なら503、理由や形が不正なら400", async () => {
    const created = await createListing();
    const unavailable = await reportListing(created.slug, session(1));
    const noSecret = await app.request(
      `/api/listings/${created.slug}/report`,
      jsonRequest({ reason: "spam" }, { reporterIp: "203.0.113.2", session: session(2) }),
      { ...bindings, REPORT_HASH_KEY: undefined },
    );
    expect(unavailable.status).toBe(202);
    expect(noSecret.status).toBe(503);
    expect((await reportListing(created.slug, session(3), { reason: "dislike" })).status).toBe(400);
    expect(
      (
        await app.request(
          `/api/listings/${created.slug}/report`,
          jsonRequest({ extra: true, reason: "spam" }, { session: session(4) }),
          bindings,
        )
      ).status,
    ).toBe(400);
  });

  it.each(["visited", "directory_searched", "listing_opened", "outbound_opened", "returned"])(
    "ブラウザーイベント %s を受け付ける",
    async (name) => {
      const response = await app.request(
        "/api/events",
        jsonRequest({ listingId: "", name }, { qa: true, session: session(8) }),
        bindings,
      );
      expect(response.status).toBe(202);
    },
  );

  it.each([
    "listing_created",
    "listing_updated",
    "listing_closed",
    "listing_deleted",
    "listing_reported",
  ])("サーバーイベント %s の偽装を拒否する", async (name) => {
    const response = await app.request(
      "/api/events",
      jsonRequest({ listingId: "", name }, { session: session(9) }),
      bindings,
    );
    expect(response.status).toBe(400);
  });

  it("QAイベントを明示して本番指標と分離する", async () => {
    await createListing({ qa: true });
    const rows = await bindings.DB.prepare(
      "SELECT name, is_qa FROM product_events ORDER BY id",
    ).all<{ is_qa: number; name: string }>();
    expect(rows.results).toEqual([{ is_qa: 1, name: "listing_created" }]);
  });
});

describe("discovery and retention", () => {
  it("サイトマップは固定4ページと公開中の募集だけを含む", async () => {
    const created = await createListing();
    const response = await app.request("/sitemap.xml", undefined, bindings);
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/xml");
    expect(body.match(/<url>/g)).toHaveLength(5);
    for (const path of ["/", "/list", "/guide", "/privacy", `/r/${created.slug}`]) {
      expect(body).toContain(`${origin}${path}`);
    }
  });

  it("期限切れを閉じ、古い非公開募集とイベントを削除する", async () => {
    const created = await createListing();
    const old = Math.floor(Date.now() / 1000) - 50 * 86400;
    await bindings.DB.batch([
      bindings.DB.prepare("UPDATE listings SET expires_on = ?, updated_at = ? WHERE id = ?").bind(
        plusDays(-1),
        old,
        created.id,
      ),
      bindings.DB.prepare("UPDATE product_events SET created_at = ?, day = ?").bind(
        old,
        plusDays(-50),
      ),
      bindings.DB.prepare(
        `INSERT INTO product_events (name, session_id, listing_id, day, created_at, is_qa)
           VALUES ('visited', ?, NULL, ?, ?, 0)`,
      ).bind(session(77), plusDays(-50), old),
    ]);
    await scheduled({} as ScheduledController, bindings, {} as ExecutionContext);
    const closed = await bindings.DB.prepare("SELECT status FROM listings WHERE id = ?")
      .bind(created.id)
      .first<{ status: string }>();
    expect(closed?.status).toBe("closed");
    await bindings.DB.prepare("UPDATE listings SET updated_at = ? WHERE id = ?")
      .bind(old, created.id)
      .run();
    await scheduled({} as ScheduledController, bindings, {} as ExecutionContext);
    expect(
      await bindings.DB.prepare("SELECT COUNT(*) AS count FROM listings").first<{
        count: number;
      }>(),
    ).toEqual({ count: 0 });
    expect(
      await bindings.DB.prepare("SELECT COUNT(*) AS count FROM product_events").first<{
        count: number;
      }>(),
    ).toEqual({ count: 0 });
  });
});

describe("release contract", () => {
  it("イベント契約はDB・ワーカー・計測SQLで一致する", async () => {
    expect([...eventNames]).toEqual([
      "visited",
      "directory_searched",
      "listing_created",
      "listing_opened",
      "outbound_opened",
      "listing_updated",
      "listing_closed",
      "listing_deleted",
      "listing_reported",
      "returned",
    ]);
    const metrics = await readFile(metricsPath, "utf8");
    expect(metrics).toContain("WHERE is_qa = 0");
    expect(metrics).toContain("qualified_listings");
    expect(metrics).toContain("outbound_users >= 2");
    expect(metrics).toContain("viewers >= 3");
  });

  it("ブラウザーコードは同一オリジンだけを呼び、内容をHTML化しない", async () => {
    const scripts = (
      await Promise.all(
        [commonPath, appPath, directoryPath, listingPath, editPath].map((path) =>
          readFile(path, "utf8"),
        ),
      )
    ).join("\n");
    expect(scripts).not.toMatch(/fetch\(\s*["']https?:\/\//);
    expect(scripts).not.toMatch(/innerHTML|eval\(|new Function/);
    expect(scripts).toContain('fetch("/api/events"');
    expect(scripts).toContain('fetchJson("/api/listings"');
    expect(scripts).toContain("x-nakama-fuda-capability");
    expect(scripts).not.toMatch(
      /navigator\.geolocation|getCurrentPosition|Notification\.requestPermission|getUserMedia/,
    );
  });

  it("サービスワーカーは動的・編集ページをキャッシュしない", async () => {
    const source = await readFile(serviceWorkerPath, "utf8");
    expect(source).toContain('const cacheName = "nakama-fuda-v1"');
    expect(source).toContain("cacheablePaths.has(url.pathname)");
    expect(source).not.toContain('"/list"');
    expect(source).not.toContain('"/r/"');
    expect(source).not.toContain('"/edit/"');
  });

  it("見出しを巨大化せず印刷でも読める", async () => {
    const source = await readFile(stylesPath, "utf8");
    expect(source).toContain("clamp(1.75rem, 3.2vw, 2rem)");
    expect(source).toContain("@media print");
    expect(source).not.toMatch(/h1\s*\{[^}]*font-size:\s*(?:[4-9]\d|[1-9]\d{2})px/s);
  });

  it("PWAと検索向けメタデータが製品固有", async () => {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const robots = await readFile(robotsPath, "utf8");
    expect(manifest.name).toBe("仲間札");
    expect(manifest.description).toContain("ゲームの仲間");
    expect(robots).toContain(`${origin}/sitemap.xml`);
    expect(robots).not.toContain("Disallow:");
  });

  it("OGは用途を絵で示す十分なラスター画像", async () => {
    const source = await readFile(ogPath);
    expect(source.byteLength).toBeGreaterThan(50000);
    expect(source.subarray(1, 4).toString("ascii")).toBe("PNG");
  });

  it("ワーカーは厳格なCSPと保持期限を持つ", async () => {
    const source = await readFile(workerPath, "utf8");
    expect(source).toContain("styleSrc: [\"'self'\"]");
    expect(source).not.toContain("'unsafe-inline'");
    expect(source).not.toMatch(/style=\{/);
    expect(source).toContain("45 * 86400");
    expect(source).toContain("30 * 86400");
    expect(source).toContain("DELETE FROM product_events WHERE created_at <= ?");
    expect(source).not.toMatch(/better-auth|betterAuth/i);
  });
});

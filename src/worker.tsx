/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import { html } from "hono/html";
import type { Child } from "hono/jsx";
import { jsxRenderer } from "hono/jsx-renderer";
import { secureHeaders } from "hono/secure-headers";

export type Bindings = {
  ASSETS: Fetcher;
  DB: D1Database;
  REPORT_HASH_KEY?: string;
};

type Variables = { requestId: string };
type Platform = "crossplay" | "mobile" | "other" | "pc" | "playstation" | "switch" | "xbox";
type ActivityTime = "day" | "evening" | "flexible" | "late" | "morning";
type Frequency = "casual" | "frequent" | "weekly";
type VoiceChat = "none" | "optional" | "required";
type Style =
  | "battle"
  | "casual"
  | "competitive"
  | "creation"
  | "events"
  | "roleplay"
  | "social"
  | "support";

type ListingInput = {
  activityTime: ActivityTime;
  applicationUrl: string;
  beginners: boolean;
  description: string;
  expiresOn: string;
  frequency: Frequency;
  gameName: string;
  groupName: string;
  groupSize: number;
  headline: string;
  openSeats: number;
  platform: Platform;
  serverName: string;
  styles: Style[];
  trial: boolean;
  vc: VoiceChat;
};

type ListingRow = {
  activity_time: ActivityTime;
  application_url: string;
  beginners: number;
  created_at: number;
  description: string;
  expires_on: string;
  frequency: Frequency;
  game_name: string;
  group_name: string;
  group_size: number;
  headline: string;
  id: string;
  open_seats: number;
  platform: Platform;
  report_count: number;
  server_name: string;
  slug: string;
  status: "active" | "closed" | "hidden";
  styles: string;
  trial: number;
  updated_at: number;
  vc: VoiceChat;
};

type DirectoryFilters = {
  activityTime: string;
  beginners: boolean;
  platform: string;
  query: string;
  vc: string;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const canonicalOrigin = "https://nakama-fuda.yhay81.com";
const eventLifetime = 45 * 86400;
const inactiveLifetime = 30 * 86400;
const eventNames = new Set([
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
const browserEventNames = new Set([
  "visited",
  "directory_searched",
  "listing_opened",
  "outbound_opened",
  "returned",
]);
const platforms = new Set<Platform>([
  "crossplay",
  "mobile",
  "other",
  "pc",
  "playstation",
  "switch",
  "xbox",
]);
const activityTimes = new Set<ActivityTime>(["day", "evening", "flexible", "late", "morning"]);
const frequencies = new Set<Frequency>(["casual", "frequent", "weekly"]);
const voiceChats = new Set<VoiceChat>(["none", "optional", "required"]);
const styleValues = new Set<Style>([
  "battle",
  "casual",
  "competitive",
  "creation",
  "events",
  "roleplay",
  "social",
  "support",
]);
const reportReasons = new Set(["harmful", "impersonation", "other", "spam"]);
const sessionPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuidPattern = sessionPattern;
const slugPattern = /^[A-Za-z0-9_-]{12}$/;
const capabilityPattern = /^[A-Za-z0-9_-]{43}$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const exactListingKeys = [
  "activityTime",
  "applicationUrl",
  "beginners",
  "description",
  "expiresOn",
  "frequency",
  "gameName",
  "groupName",
  "groupSize",
  "headline",
  "openSeats",
  "platform",
  "serverName",
  "styles",
  "trial",
  "vc",
];

const platformLabels: Record<Platform, string> = {
  crossplay: "クロスプレイ",
  mobile: "モバイル",
  other: "その他",
  pc: "PC",
  playstation: "PlayStation",
  switch: "Switch",
  xbox: "Xbox",
};
const timeLabels: Record<ActivityTime, string> = {
  day: "昼",
  evening: "夜",
  flexible: "不定期",
  late: "深夜",
  morning: "朝",
};
const frequencyLabels: Record<Frequency, string> = {
  casual: "ゆっくり",
  frequent: "週4回以上",
  weekly: "週1〜3回",
};
const vcLabels: Record<VoiceChat, string> = {
  none: "VCなし",
  optional: "VC任意",
  required: "VC必須",
};
const styleLabels: Record<Style, string> = {
  battle: "バトル",
  casual: "のんびり",
  competitive: "競技",
  creation: "制作",
  events: "イベント",
  roleplay: "ロールプレイ",
  social: "交流",
  support: "攻略支援",
};

const nowSeconds = () => Math.floor(Date.now() / 1000);
const day = () => new Date().toISOString().slice(0, 10);

const containsControlCharacter = (value: string) =>
  Array.from(value).some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 32 || code === 127;
  });

const singleLine = (value: unknown, minimum: number, maximum: number) =>
  typeof value === "string" &&
  value === value.trim() &&
  value.length >= minimum &&
  value.length <= maximum &&
  !containsControlCharacter(value);

const plainLine = (value: unknown, minimum: number, maximum: number) =>
  singleLine(value, minimum, maximum) &&
  !/(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b0\d{1,4}-?\d{2,4}-?\d{3,4}\b)/iu.test(
    value as string,
  );

const plainDescription = (value: unknown) => {
  if (typeof value !== "string" || value !== value.trim() || value.length > 500) return false;
  if (containsControlCharacter(value.replaceAll("\n", ""))) return false;
  return !/(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b0\d{1,4}-?\d{2,4}-?\d{3,4}\b)/iu.test(
    value,
  );
};

const validHttpsUrl = (value: unknown) => {
  if (typeof value !== "string" || value.length > 500) return false;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      hostname.length <= 253 &&
      hostname !== "localhost" &&
      hostname !== "0.0.0.0" &&
      hostname !== "::1" &&
      !hostname.endsWith(".local") &&
      !hostname.endsWith(".internal") &&
      !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) &&
      !hostname.includes(":")
    );
  } catch {
    return false;
  }
};

const isExactObject = (value: unknown, keys: string[]) =>
  Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join("|") === [...keys].sort().join("|"),
  );

const dateNumber = (value: string) => {
  if (!datePattern.test(value)) return Number.NaN;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value
    ? parsed
    : Number.NaN;
};

const validExpiry = (value: unknown) => {
  if (typeof value !== "string") return false;
  const parsed = dateNumber(value);
  const today = dateNumber(day());
  return (
    Number.isFinite(parsed) && parsed >= today + 7 * 86400000 && parsed <= today + 90 * 86400000
  );
};

const validListingInput = (value: unknown): value is ListingInput => {
  if (!isExactObject(value, exactListingKeys)) return false;
  const input = value as Partial<ListingInput>;
  if (
    !plainLine(input.gameName, 1, 60) ||
    !plainLine(input.groupName, 1, 60) ||
    !plainLine(input.headline, 1, 80) ||
    !plainDescription(input.description) ||
    (input.serverName !== "" && !plainLine(input.serverName, 1, 40)) ||
    !platforms.has(input.platform as Platform) ||
    !activityTimes.has(input.activityTime as ActivityTime) ||
    !frequencies.has(input.frequency as Frequency) ||
    !voiceChats.has(input.vc as VoiceChat) ||
    typeof input.beginners !== "boolean" ||
    typeof input.trial !== "boolean" ||
    !Number.isInteger(input.groupSize) ||
    Number(input.groupSize) < 1 ||
    Number(input.groupSize) > 999 ||
    !Number.isInteger(input.openSeats) ||
    Number(input.openSeats) < 1 ||
    Number(input.openSeats) > 100 ||
    !Array.isArray(input.styles) ||
    input.styles.length < 1 ||
    input.styles.length > 5 ||
    new Set(input.styles).size !== input.styles.length ||
    !input.styles.every((style) => styleValues.has(style)) ||
    !validHttpsUrl(input.applicationUrl) ||
    !validExpiry(input.expiresOn)
  ) {
    return false;
  }
  return true;
};

const parseJson = async (request: Request, maximum: number): Promise<unknown> => {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maximum) throw new Error("body_too_large");
  return JSON.parse(raw);
};

const validRequestBoundary = (request: Request, maximum: number) => {
  const origin = request.headers.get("origin");
  const requestOrigin = new URL(request.url).origin;
  const contentType = request.headers.get("content-type") ?? "";
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  return (
    (!origin || origin === requestOrigin) &&
    contentType.toLowerCase().startsWith("application/json") &&
    Number.isFinite(contentLength) &&
    contentLength <= maximum
  );
};

const randomBase64Url = (bytes: number) => {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = "";
  for (const value of data) binary += String.fromCharCode(value);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const reportFingerprint = async (
  request: Request,
  secret: string | undefined,
  listingId: string,
  sessionId: string,
) => {
  if (!secret || secret.length < 32) return "";
  const hostname = new URL(request.url).hostname;
  const network =
    request.headers.get("cf-connecting-ip")?.trim() ||
    (hostname === "localhost" || hostname === "127.0.0.1" ? `local:${sessionId}` : "");
  if (!network || network.length > 64) return "";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${listingId}\u0000${network}`),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const sessionFrom = (request: Request) => {
  const session = request.headers.get("x-nakama-fuda-session") ?? "";
  return sessionPattern.test(session) ? session.toLowerCase() : "";
};

const qaFrom = (request: Request) => (request.headers.get("x-nakama-fuda-qa") === "1" ? 1 : 0);

const insertEvent = (
  database: D1Database,
  name: string,
  sessionId: string,
  listingId: string,
  isQa: number,
) =>
  database
    .prepare(
      `INSERT INTO product_events (name, session_id, listing_id, day, created_at, is_qa)
       VALUES (?, ?, NULLIF(?, ''), ?, ?, ?)`,
    )
    .bind(name, sessionId, listingId, day(), nowSeconds(), isQa)
    .run();

const listingSelect = `SELECT id, slug, game_name, group_name, headline, description, platform,
  server_name, activity_time, frequency, group_size, open_seats, vc, beginners, trial, styles,
  application_url, expires_on, status, report_count, created_at, updated_at FROM listings`;

const findListing = (database: D1Database, slug: string, publicOnly = false) =>
  database
    .prepare(
      `${listingSelect} WHERE slug = ?${
        publicOnly ? " AND status = 'active' AND expires_on >= ?" : ""
      }`,
    )
    .bind(...(publicOnly ? [slug, day()] : [slug]))
    .first<ListingRow>();

const authorizedListing = async (request: Request, database: D1Database, slug: string) => {
  const capability = request.headers.get("x-nakama-fuda-capability") ?? "";
  if (!capabilityPattern.test(capability)) return null;
  const hash = await sha256(capability);
  return database
    .prepare(`${listingSelect} WHERE slug = ? AND capability_hash = ?`)
    .bind(slug, hash)
    .first<ListingRow>();
};

const rowToInput = (row: ListingRow): ListingInput => ({
  activityTime: row.activity_time,
  applicationUrl: row.application_url,
  beginners: Boolean(row.beginners),
  description: row.description,
  expiresOn: row.expires_on,
  frequency: row.frequency,
  gameName: row.game_name,
  groupName: row.group_name,
  groupSize: row.group_size,
  headline: row.headline,
  openSeats: row.open_seats,
  platform: row.platform,
  serverName: row.server_name,
  styles: JSON.parse(row.styles) as Style[],
  trial: Boolean(row.trial),
  vc: row.vc,
});

const directoryFilters = (url: URL): DirectoryFilters => {
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 60);
  const platform = url.searchParams.get("platform") ?? "";
  const activityTime = url.searchParams.get("time") ?? "";
  const vc = url.searchParams.get("vc") ?? "";
  return {
    activityTime: activityTimes.has(activityTime as ActivityTime) ? activityTime : "",
    beginners: url.searchParams.get("beginners") === "1",
    platform: platforms.has(platform as Platform) ? platform : "",
    query,
    vc: voiceChats.has(vc as VoiceChat) ? vc : "",
  };
};

const listDirectory = async (database: D1Database, filters: DirectoryFilters) => {
  const where = ["status = 'active'", "expires_on >= ?"];
  const values: unknown[] = [day()];
  if (filters.query) {
    where.push(
      "(game_name LIKE ? ESCAPE '\\' OR group_name LIKE ? ESCAPE '\\' OR headline LIKE ? ESCAPE '\\')",
    );
    const escaped = filters.query
      .replaceAll("\\", "\\\\")
      .replaceAll("%", "\\%")
      .replaceAll("_", "\\_");
    values.push(`%${escaped}%`, `%${escaped}%`, `%${escaped}%`);
  }
  if (filters.platform) {
    where.push("platform = ?");
    values.push(filters.platform);
  }
  if (filters.activityTime) {
    where.push("activity_time = ?");
    values.push(filters.activityTime);
  }
  if (filters.vc) {
    where.push("vc = ?");
    values.push(filters.vc);
  }
  if (filters.beginners) where.push("beginners = 1");
  return database
    .prepare(`${listingSelect} WHERE ${where.join(" AND ")} ORDER BY updated_at DESC LIMIT 24`)
    .bind(...values)
    .all<ListingRow>();
};

const Logo = () => (
  <span class="logo-mark" aria-hidden="true">
    <i></i>
    <i></i>
    <i></i>
  </span>
);

const RecruitDesk = () => (
  <div class="recruit-desk" aria-label="活動時計と条件札を囲み、空席を残したゲーム仲間の募集卓">
    <span class="desk-clock">
      <i></i>
      <b>21:00</b>
    </span>
    <span class="seat seat-one">
      <i></i>
      <b>参加</b>
    </span>
    <span class="seat seat-two">
      <i></i>
      <b>参加</b>
    </span>
    <span class="seat seat-open">
      <i></i>
      <b>空席</b>
    </span>
    <span class="condition-card card-game">
      <small>GAME</small>
      <b>星渡りの旅</b>
    </span>
    <span class="condition-card card-style">
      <small>STYLE</small>
      <b>のんびり</b>
    </span>
    <span class="condition-card card-vc">
      <small>VOICE</small>
      <b>任意</b>
    </span>
    <span class="table-ring"></span>
  </div>
);

const Layout = (props: {
  children: Child;
  description: string;
  noindex?: boolean;
  path?: string;
  title: string;
}) => {
  const url = `${canonicalOrigin}${props.path ?? "/"}`;
  return (
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta content="width=device-width, initial-scale=1" name="viewport" />
        <meta content="#efe9db" name="theme-color" />
        <meta content={props.description} name="description" />
        {props.noindex && <meta content="noindex,nofollow" name="robots" />}
        <meta content="website" property="og:type" />
        <meta content={props.title} property="og:title" />
        <meta content={props.description} property="og:description" />
        <meta content={`${canonicalOrigin}/og.png`} property="og:image" />
        <meta
          content="活動時計と条件札を囲み、空席を残したゲーム仲間の募集卓"
          property="og:image:alt"
        />
        <meta content={url} property="og:url" />
        <meta content="仲間札" property="og:site_name" />
        <meta content="summary_large_image" name="twitter:card" />
        <link href={url} rel="canonical" />
        <link href="/favicon.png" rel="icon" type="image/png" />
        <link href="/manifest.webmanifest" rel="manifest" />
        <link href="/styles.css" rel="stylesheet" />
        <title>{props.title}</title>
      </head>
      <body>
        <a class="skip-link" href="#main">
          本文へ移動
        </a>
        <header class="site-header">
          <a class="brand" href="/" aria-label="仲間札 ホーム">
            <Logo />
            <span>仲間札</span>
          </a>
          <nav aria-label="ページ">
            <a href="/list">募集を探す</a>
            <a href="/guide">使い方</a>
            <a href="/privacy">安全と保存</a>
          </nav>
        </header>
        {props.children}
        <footer>
          <a class="brand" href="/">
            <Logo />
            <span>仲間札</span>
          </a>
          <p>遊び方の合う席へ。</p>
          <nav aria-label="フッター">
            <a href="/list">募集を探す</a>
            <a href="/guide">使い方</a>
            <a href="/privacy">安全と保存</a>
            <a href="https://github.com/yhay81/nakama-fuda">GitHub</a>
          </nav>
        </footer>
      </body>
    </html>
  );
};

const PlatformOptions = (props: { any?: boolean; current?: string }) => (
  <>
    {props.any && (
      <option selected={!props.current} value="">
        すべての機種
      </option>
    )}
    {Object.entries(platformLabels).map(([value, label]) => (
      <option selected={props.current === value} value={value}>
        {label}
      </option>
    ))}
  </>
);
const TimeOptions = (props: { any?: boolean; current?: string }) => (
  <>
    {props.any && (
      <option selected={!props.current} value="">
        すべての時間
      </option>
    )}
    {Object.entries(timeLabels).map(([value, label]) => (
      <option selected={props.current === value} value={value}>
        {label}
      </option>
    ))}
  </>
);
const VoiceOptions = (props: { any?: boolean; current?: string }) => (
  <>
    {props.any && (
      <option selected={!props.current} value="">
        すべてのVC
      </option>
    )}
    {Object.entries(vcLabels).map(([value, label]) => (
      <option selected={props.current === value} value={value}>
        {label}
      </option>
    ))}
  </>
);

const ListingForm = (props: { editing?: boolean }) => (
  <form class="listing-form" data-listing-form>
    <label>
      <span>ゲーム名</span>
      <input maxLength={60} name="gameName" required placeholder="星渡りの旅" />
    </label>
    <label>
      <span>グループ名</span>
      <input maxLength={60} name="groupName" required placeholder="夜ふかし探検隊" />
    </label>
    <label class="span-two">
      <span>ひとこと</span>
      <input
        maxLength={80}
        name="headline"
        required
        placeholder="社会人中心、週末の夜にゆっくり遊びます"
      />
    </label>
    <label>
      <span>機種</span>
      <select name="platform">
        <PlatformOptions />
      </select>
    </label>
    <label>
      <span>地域・サーバー（任意）</span>
      <input maxLength={40} name="serverName" placeholder="サーバー2 / 日本" />
    </label>
    <label>
      <span>活動時間</span>
      <select name="activityTime">
        <TimeOptions />
      </select>
    </label>
    <label>
      <span>頻度</span>
      <select name="frequency">
        <option value="casual">ゆっくり</option>
        <option value="weekly">週1〜3回</option>
        <option value="frequent">週4回以上</option>
      </select>
    </label>
    <label>
      <span>現在人数</span>
      <input max={999} min={1} name="groupSize" required type="number" value={8} />
    </label>
    <label>
      <span>空席</span>
      <input max={100} min={1} name="openSeats" required type="number" value={3} />
    </label>
    <label>
      <span>ボイスチャット</span>
      <select name="vc">
        <VoiceOptions />
      </select>
    </label>
    <label>
      <span>募集期限</span>
      <input name="expiresOn" required type="date" />
    </label>
    <fieldset class="span-two">
      <legend>参加しやすさ</legend>
      <label class="check-line">
        <input name="beginners" type="checkbox" />
        <span>初心者・復帰歓迎</span>
      </label>
      <label class="check-line">
        <input name="trial" type="checkbox" />
        <span>体験参加あり</span>
      </label>
    </fieldset>
    <fieldset class="span-two style-picker">
      <legend>遊び方（5つまで）</legend>
      {Object.entries(styleLabels).map(([value, label]) => (
        <label class="check-chip">
          <input name="styles" type="checkbox" value={value} />
          <span>{label}</span>
        </label>
      ))}
    </fieldset>
    <label class="span-two">
      <span>募集の説明</span>
      <textarea
        maxLength={500}
        name="description"
        rows={5}
        placeholder="普段の遊び方、雰囲気、守ってほしいことを書きます。IDや連絡先は応募先URLへ。"
      ></textarea>
    </label>
    <label class="span-two">
      <span>HTTPS応募先</span>
      <input
        maxLength={500}
        name="applicationUrl"
        required
        placeholder="https://example.com/join"
        type="url"
      />
      <small>公式募集ページ、応募フォーム、Discord招待など。ID・メールは掲載できません。</small>
    </label>
    <p class="form-state span-two" data-form-state aria-live="polite"></p>
    <div class="form-actions span-two">
      <button class="primary-button" type="submit">
        {props.editing ? "変更を公開する" : "募集札を出す"}
      </button>
    </div>
  </form>
);

const DemoListing = () => (
  <article class="demo-listing">
    <div class="demo-board">
      <span class="demo-clock">21:00</span>
      <span class="demo-seat filled">2</span>
      <span class="demo-seat open">3</span>
      <span class="demo-seat open">4</span>
    </div>
    <p class="section-kicker">OPEN TABLE</p>
    <h2>夜ふかし探検隊</h2>
    <p>社会人中心、週末の夜にゆっくり遊びます</p>
    <dl>
      <div>
        <dt>活動</dt>
        <dd>夜・週1〜3回</dd>
      </div>
      <div>
        <dt>空席</dt>
        <dd>3席</dd>
      </div>
      <div>
        <dt>VC</dt>
        <dd>任意</dd>
      </div>
    </dl>
    <div class="tag-row">
      <span>初心者歓迎</span>
      <span>体験あり</span>
      <span>のんびり</span>
    </div>
  </article>
);

const Home = () => (
  <Layout
    description="活動時間、遊び方、VC、初心者可否、体験参加を見比べて、オンラインゲームの仲間募集を探せる公開募集札。"
    title="仲間札｜遊び方の合う席へ"
  >
    <main id="main">
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">GAME GROUP DIRECTORY</p>
          <h1>遊び方の合う席へ。</h1>
          <p>
            活動時間、頻度、VC、初心者歓迎、体験参加。募集文の奥に隠れていた条件を、ひとつの卓で見比べます。
          </p>
          <div class="hero-actions">
            <a class="primary-button" href="/list">
              募集を探す
            </a>
            <a class="quiet-button" href="#make">
              募集札を出す
            </a>
          </div>
          <ul class="trust-row">
            <li>登録・広告なし</li>
            <li>ID・メール不要</li>
            <li>90日で期限切れ</li>
          </ul>
        </div>
        <RecruitDesk />
      </section>
      <section class="maker" id="make">
        <header class="maker-heading">
          <div>
            <p class="section-kicker">SET THE TABLE</p>
            <h2>募集卓をひらく</h2>
            <p>ゲームの画像や長い自己紹介は不要です。合う・合わないを決める条件だけ並べます。</p>
          </div>
          <div class="key-card" aria-hidden="true">
            <i></i>
            <span>EDIT KEY</span>
          </div>
        </header>
        <div class="maker-grid">
          <ListingForm />
          <DemoListing />
        </div>
      </section>
    </main>
    <dialog class="result-dialog" data-result-dialog>
      <div class="result-table" aria-hidden="true">
        <i></i>
        <i></i>
        <i></i>
      </div>
      <p class="section-kicker">TABLE IS OPEN</p>
      <h2>募集札を公開しました</h2>
      <p>公開URLは応募者へ。編集URLは募集の更新・終了に使うため、自分だけで保存してください。</p>
      <label>
        <span>公開URL</span>
        <div class="copy-row">
          <input data-public-url readonly />
          <button data-copy="public" type="button">
            コピー
          </button>
        </div>
      </label>
      <label class="secret-url">
        <span>編集URL</span>
        <div class="copy-row">
          <input data-edit-url readonly />
          <button data-copy="edit" type="button">
            コピー
          </button>
        </div>
      </label>
      <p class="key-warning">編集URLは再発行できません。安全な場所へ保存してください。</p>
      <div class="result-actions">
        <a class="quiet-button" data-open-public target="_blank" rel="noopener noreferrer">
          公開ページを見る
        </a>
        <a class="primary-button" data-open-editor>
          編集画面へ
        </a>
      </div>
    </dialog>
    <script src="/app.js" type="module"></script>
  </Layout>
);

const ListingCard = (props: { row: ListingRow }) => {
  const input = rowToInput(props.row);
  return (
    <article class="listing-card" data-listing={props.row.id}>
      <div class="card-top">
        <span class="game-label">{input.gameName}</span>
        <span class="seat-count">
          <i></i>
          {input.openSeats}席
        </span>
      </div>
      <h2>
        <a href={`/r/${props.row.slug}`}>{input.groupName}</a>
      </h2>
      <p>{input.headline}</p>
      <dl>
        <div>
          <dt>機種</dt>
          <dd>{platformLabels[input.platform]}</dd>
        </div>
        <div>
          <dt>活動</dt>
          <dd>
            {timeLabels[input.activityTime]}・{frequencyLabels[input.frequency]}
          </dd>
        </div>
        <div>
          <dt>VC</dt>
          <dd>{vcLabels[input.vc]}</dd>
        </div>
      </dl>
      <div class="tag-row">
        {input.beginners && <span>初心者歓迎</span>}
        {input.trial && <span>体験あり</span>}
        {input.styles.slice(0, 3).map((style) => (
          <span>{styleLabels[style]}</span>
        ))}
      </div>
      <a class="card-link" href={`/r/${props.row.slug}`}>
        募集札を見る <span aria-hidden="true">→</span>
      </a>
    </article>
  );
};

const Directory = (props: { filters: DirectoryFilters; rows: ListingRow[] }) => (
  <Layout
    description="ゲーム名、機種、活動時間、VC、初心者可否から、オンラインゲームの公開仲間募集を絞り込む。"
    path="/list"
    title="募集を探す｜仲間札"
  >
    <main class="directory-page" data-directory-root id="main">
      <header class="page-intro">
        <div class="page-symbol search" aria-hidden="true">
          <i></i>
          <i></i>
          <i></i>
        </div>
        <div>
          <p class="eyebrow">FIND YOUR TABLE</p>
          <h1>空いている席を探す</h1>
          <p>ゲーム名だけでなく、普段遊ぶ時間と距離感から絞り込めます。</p>
        </div>
      </header>
      <form action="/list" class="filter-bar" method="get">
        <label class="search-field">
          <span>ゲーム・グループ</span>
          <input
            maxLength={60}
            name="q"
            placeholder="ゲーム名や募集名"
            value={props.filters.query}
          />
        </label>
        <label>
          <span>機種</span>
          <select name="platform">
            <PlatformOptions any current={props.filters.platform} />
          </select>
        </label>
        <label>
          <span>活動時間</span>
          <select name="time">
            <TimeOptions any current={props.filters.activityTime} />
          </select>
        </label>
        <label>
          <span>VC</span>
          <select name="vc">
            <VoiceOptions any current={props.filters.vc} />
          </select>
        </label>
        <label class="check-line filter-check">
          <input checked={props.filters.beginners} name="beginners" type="checkbox" value="1" />
          <span>初心者歓迎</span>
        </label>
        <button class="primary-button" type="submit">
          絞り込む
        </button>
      </form>
      <div class="directory-heading">
        <div>
          <p class="section-kicker">OPEN TABLES</p>
          <h2>
            {props.rows.length ? `${props.rows.length}件の募集札` : "条件に合う募集はありません"}
          </h2>
        </div>
        <a class="quiet-button" href="/#make">
          募集札を出す
        </a>
      </div>
      {props.rows.length ? (
        <section class="listing-grid" aria-label="募集一覧">
          {props.rows.map((row) => (
            <ListingCard row={row} />
          ))}
        </section>
      ) : (
        <section class="empty-board">
          <div aria-hidden="true">
            <i></i>
            <i></i>
            <i></i>
          </div>
          <p>条件を減らすか、最初の募集札を出してみてください。</p>
        </section>
      )}
    </main>
    <script src="/directory.js" type="module"></script>
  </Layout>
);

const Detail = (props: { row: ListingRow }) => {
  const input = rowToInput(props.row);
  return (
    <Layout
      description={`${input.gameName}「${input.groupName}」の仲間募集。${input.headline}`}
      path={`/r/${props.row.slug}`}
      title={`${input.groupName}｜${input.gameName}｜仲間札`}
    >
      <main
        class="detail-page"
        data-listing-id={props.row.id}
        data-listing-root
        data-slug={props.row.slug}
        id="main"
      >
        <header class="detail-hero">
          <div class="detail-table" aria-hidden="true">
            <span class="clock">{timeLabels[input.activityTime]}</span>
            <i></i>
            <i></i>
            <i class="open"></i>
          </div>
          <div>
            <p class="eyebrow">{input.gameName}</p>
            <h1>{input.groupName}</h1>
            <p>{input.headline}</p>
            <div class="tag-row">
              {input.beginners && <span>初心者・復帰歓迎</span>}
              {input.trial && <span>体験参加あり</span>}
              {input.styles.map((style) => (
                <span>{styleLabels[style]}</span>
              ))}
            </div>
          </div>
        </header>
        <section class="detail-board">
          <dl class="condition-grid">
            <div>
              <dt>ゲーム</dt>
              <dd>{input.gameName}</dd>
            </div>
            <div>
              <dt>機種</dt>
              <dd>{platformLabels[input.platform]}</dd>
            </div>
            <div>
              <dt>地域・サーバー</dt>
              <dd>{input.serverName || "指定なし"}</dd>
            </div>
            <div>
              <dt>活動時間</dt>
              <dd>{timeLabels[input.activityTime]}</dd>
            </div>
            <div>
              <dt>頻度</dt>
              <dd>{frequencyLabels[input.frequency]}</dd>
            </div>
            <div>
              <dt>VC</dt>
              <dd>{vcLabels[input.vc]}</dd>
            </div>
            <div>
              <dt>現在人数</dt>
              <dd>{input.groupSize}人</dd>
            </div>
            <div class="open-condition">
              <dt>空席</dt>
              <dd>{input.openSeats}席</dd>
            </div>
            <div>
              <dt>募集期限</dt>
              <dd>
                <time datetime={input.expiresOn}>{input.expiresOn}</time>
              </dd>
            </div>
          </dl>
          <article class="description-card">
            <p class="section-kicker">ABOUT THIS TABLE</p>
            <h2>この卓の遊び方</h2>
            <p>{input.description || "詳しい案内は応募先で確認してください。"}</p>
          </article>
          <div class="apply-panel">
            <div>
              <strong>条件が合いそうですか？</strong>
              <span>応募先は外部のHTTPSページで開きます。</span>
            </div>
            <a
              class="primary-button"
              data-outbound
              href={input.applicationUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              応募先を開く <span aria-hidden="true">↗</span>
            </a>
          </div>
        </section>
        <section class="report-panel">
          <details>
            <summary>この募集札を報告</summary>
            <form data-report-form>
              <label>
                <span>理由</span>
                <select name="reason">
                  <option value="spam">迷惑行為</option>
                  <option value="impersonation">なりすまし</option>
                  <option value="harmful">有害な内容</option>
                  <option value="other">その他</option>
                </select>
              </label>
              <button class="quiet-button small" type="submit">
                報告する
              </button>
              <p data-report-state aria-live="polite"></p>
            </form>
          </details>
        </section>
      </main>
      <script src="/listing.js" type="module"></script>
    </Layout>
  );
};

const EditPage = (props: { slug: string }) => (
  <Layout
    description="仲間札の公開募集を編集・終了します。"
    noindex
    path={`/edit/${props.slug}`}
    title="募集札を編集｜仲間札"
  >
    <main class="edit-page" data-editor-root data-slug={props.slug} id="main">
      <header class="page-intro">
        <div class="page-symbol edit" aria-hidden="true">
          <i></i>
          <i></i>
          <i></i>
        </div>
        <div>
          <p class="eyebrow">HOST DESK</p>
          <h1>募集卓を整える</h1>
          <p>編集鍵で条件を更新し、席が埋まったら募集を閉じます。</p>
        </div>
      </header>
      <div class="workspace-status" data-editor-status aria-live="polite">
        編集鍵を確かめています…
      </div>
      <section data-editor-content hidden>
        <div class="edit-board">
          <ListingForm editing />
        </div>
        <div class="danger-zone">
          <div>
            <strong>募集を閉じる</strong>
            <span>一覧と公開ページから外します。更新保存で再公開できます。</span>
          </div>
          <button class="quiet-danger" data-action="close" type="button">
            募集終了
          </button>
        </div>
        <div class="danger-zone delete">
          <div>
            <strong>募集札を削除</strong>
            <span>元に戻せません。</span>
          </div>
          <button class="danger-button" data-action="delete" type="button">
            削除する
          </button>
        </div>
      </section>
    </main>
    <script src="/edit.js" type="module"></script>
  </Layout>
);

const Guide = () => (
  <Layout
    description="仲間札で募集条件を並べ、応募先を安全に案内し、期限内に募集を終える手順。"
    path="/guide"
    title="使い方｜仲間札"
  >
    <main class="prose-page" id="main">
      <header class="page-intro">
        <div class="page-symbol guide" aria-hidden="true">
          <i></i>
          <i></i>
          <i></i>
        </div>
        <div>
          <p class="eyebrow">HOW TO OPEN A TABLE</p>
          <h1>条件を先に並べる</h1>
          <p>長い募集文より先に、活動時間と距離感が合うかを確かめます。</p>
        </div>
      </header>
      <ol class="steps">
        <li>
          <span>1</span>
          <div>
            <h2>募集札を出す</h2>
            <p>ゲーム名、時間、頻度、VC、空席、期限、HTTPS応募先を入力します。</p>
          </div>
        </li>
        <li>
          <span>2</span>
          <div>
            <h2>条件で見つけてもらう</h2>
            <p>公開一覧では機種や活動時間で絞れます。URLを既存の募集投稿へ添えることもできます。</p>
          </div>
        </li>
        <li>
          <span>3</span>
          <div>
            <h2>応募先で連絡する</h2>
            <p>
              仲間札内にIDやメールは書きません。公式募集ページやフォームなど、管理できるHTTPS応募先へ進みます。
            </p>
          </div>
        </li>
        <li>
          <span>4</span>
          <div>
            <h2>席が埋まったら閉じる</h2>
            <p>編集URLから終了します。期限を過ぎた募集も自動で一覧から外れます。</p>
          </div>
        </li>
      </ol>
    </main>
  </Layout>
);

const Privacy = () => (
  <Layout
    description="仲間札が扱う募集情報、扱わない連絡先、編集鍵、通報、保持期間。"
    path="/privacy"
    title="安全と保存｜仲間札"
  >
    <main class="prose-page" id="main">
      <header class="page-intro">
        <div class="page-symbol privacy" aria-hidden="true">
          <i></i>
          <i></i>
          <i></i>
        </div>
        <div>
          <p class="eyebrow">SAFETY & STORAGE</p>
          <h1>連絡先を札に書かない</h1>
          <p>公開比較に必要な条件と、実際の連絡経路を分けます。</p>
        </div>
      </header>
      <div class="prose-grid">
        <section>
          <h2>公開する条件</h2>
          <p>ゲーム名、募集名、活動条件、人数、空席、遊び方、期限、HTTPS応募先を公開します。</p>
        </section>
        <section>
          <h2>扱わない情報</h2>
          <p>ゲーム内ID、メール、電話、住所、DM、コメント、口コミ、画像は入力欄を設けません。</p>
        </section>
        <section>
          <h2>編集鍵</h2>
          <p>
            256-bitの編集鍵はURL末尾にだけ置き、D1にはSHA-256ハッシュだけを保存します。再発行はできません。
          </p>
        </section>
        <section>
          <h2>期限と報告</h2>
          <p>
            期限切れ・終了・非表示の募集は30日後、匿名操作ログは45日後に削除します。異なる報告が3件集まると自動非表示になります。
          </p>
        </section>
      </div>
    </main>
  </Layout>
);

app.use(
  "*",
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      baseUri: ["'none'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      upgradeInsecureRequests: [],
    },
    crossOriginEmbedderPolicy: false,
    permissionsPolicy: { camera: [], geolocation: [], microphone: [], payment: [] },
    referrerPolicy: "no-referrer",
  }),
);

app.use("*", async (c, next) => {
  c.set("requestId", crypto.randomUUID());
  c.header("X-Request-Id", c.get("requestId"));
  c.header("Permissions-Policy", "camera=(), geolocation=(), microphone=(), payment=()");
  await next();
});

app.use(
  "*",
  jsxRenderer(({ children }) => html`${children}`),
);

app.get("/", (c) => c.render(<Home />));
app.get("/guide", (c) => c.render(<Guide />));
app.get("/privacy", (c) => c.render(<Privacy />));
app.get("/list", async (c) => {
  const filters = directoryFilters(new URL(c.req.url));
  const rows = (await listDirectory(c.env.DB, filters)).results;
  c.header("Cache-Control", "no-store");
  return c.render(<Directory filters={filters} rows={rows} />);
});
app.get("/r/:slug", async (c) => {
  const slug = c.req.param("slug");
  if (!slugPattern.test(slug)) return c.notFound();
  const row = await findListing(c.env.DB, slug, true);
  if (!row) return c.notFound();
  c.header("Cache-Control", "no-store");
  return c.render(<Detail row={row} />);
});
app.get("/edit/:slug", (c) => {
  const slug = c.req.param("slug");
  if (!slugPattern.test(slug)) return c.notFound();
  c.header("Cache-Control", "no-store");
  c.header("X-Robots-Tag", "noindex, nofollow");
  return c.render(<EditPage slug={slug} />);
});

app.get("/sitemap.xml", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT slug FROM listings WHERE status = 'active' AND expires_on >= ? ORDER BY updated_at DESC LIMIT 500",
  )
    .bind(day())
    .all<{ slug: string }>();
  const paths = [
    "/",
    "/list",
    "/guide",
    "/privacy",
    ...rows.results.map((row) => `/r/${row.slug}`),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths
    .map((path) => `  <url><loc>${canonicalOrigin}${path}</loc></url>`)
    .join("\n")}\n</urlset>`;
  c.header("Cache-Control", "public, max-age=300");
  c.header("Content-Type", "application/xml; charset=UTF-8");
  return c.body(body);
});

app.get("/health", (c) => {
  c.header("Cache-Control", "no-store");
  return c.json({
    ok: true,
    reporting: Boolean(c.env.REPORT_HASH_KEY?.length && c.env.REPORT_HASH_KEY.length >= 32),
  });
});

app.post("/api/listings", async (c) => {
  if (!validRequestBoundary(c.req.raw, 8192)) return c.json({ error: "invalid_request" }, 400);
  const sessionId = sessionFrom(c.req.raw);
  if (!sessionId) return c.json({ error: "invalid_request" }, 400);
  try {
    const input = await parseJson(c.req.raw, 8192);
    if (!validListingInput(input)) return c.json({ error: "invalid_listing" }, 400);
    const createdToday = await c.env.DB.prepare(
      `SELECT COUNT(*) AS count FROM product_events
       WHERE name = 'listing_created' AND session_id = ? AND day = ?`,
    )
      .bind(sessionId, day())
      .first<{ count: number }>();
    if ((createdToday?.count ?? 0) >= 2) return c.json({ error: "daily_limit" }, 429);
    const id = crypto.randomUUID();
    const slug = randomBase64Url(9);
    const capability = randomBase64Url(32);
    const timestamp = nowSeconds();
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO listings
           (id, slug, capability_hash, game_name, group_name, headline, description, platform,
            server_name, activity_time, frequency, group_size, open_seats, vc, beginners, trial,
            styles, application_url, expires_on, status, report_count, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, ?, ?)`,
      ).bind(
        id,
        slug,
        await sha256(capability),
        input.gameName,
        input.groupName,
        input.headline,
        input.description,
        input.platform,
        input.serverName,
        input.activityTime,
        input.frequency,
        input.groupSize,
        input.openSeats,
        input.vc,
        input.beginners ? 1 : 0,
        input.trial ? 1 : 0,
        JSON.stringify(input.styles),
        input.applicationUrl,
        input.expiresOn,
        timestamp,
        timestamp,
      ),
      c.env.DB.prepare(
        `INSERT INTO product_events (name, session_id, listing_id, day, created_at, is_qa)
           VALUES ('listing_created', ?, ?, ?, ?, ?)`,
      ).bind(sessionId, id, day(), timestamp, qaFrom(c.req.raw)),
    ]);
    const origin = new URL(c.req.url).origin;
    c.header("Cache-Control", "no-store");
    return c.json(
      {
        editUrl: `${origin}/edit/${slug}#${capability}`,
        listingId: id,
        publicUrl: `${origin}/r/${slug}`,
        slug,
      },
      201,
    );
  } catch {
    return c.json({ error: "invalid_request" }, 400);
  }
});

app.get("/api/listings/:slug", async (c) => {
  const slug = c.req.param("slug");
  const row = slugPattern.test(slug) ? await authorizedListing(c.req.raw, c.env.DB, slug) : null;
  if (!row) return c.json({ error: "not_found" }, 404);
  c.header("Cache-Control", "no-store");
  return c.json({
    listing: rowToInput(row),
    publicUrl: `${new URL(c.req.url).origin}/r/${slug}`,
    status: row.status,
    updatedAt: row.updated_at,
  });
});

app.put("/api/listings/:slug", async (c) => {
  if (!validRequestBoundary(c.req.raw, 8192)) return c.json({ error: "invalid_request" }, 400);
  const sessionId = sessionFrom(c.req.raw);
  const slug = c.req.param("slug");
  if (!sessionId || !slugPattern.test(slug)) return c.json({ error: "invalid_request" }, 400);
  const row = await authorizedListing(c.req.raw, c.env.DB, slug);
  if (!row) return c.json({ error: "not_found" }, 404);
  try {
    const input = await parseJson(c.req.raw, 8192);
    if (!validListingInput(input)) return c.json({ error: "invalid_listing" }, 400);
    const timestamp = nowSeconds();
    await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE listings SET game_name = ?, group_name = ?, headline = ?, description = ?,
           platform = ?, server_name = ?, activity_time = ?, frequency = ?, group_size = ?,
           open_seats = ?, vc = ?, beginners = ?, trial = ?, styles = ?, application_url = ?,
           expires_on = ?, status = 'active', report_count = 0, updated_at = ? WHERE id = ?`,
      ).bind(
        input.gameName,
        input.groupName,
        input.headline,
        input.description,
        input.platform,
        input.serverName,
        input.activityTime,
        input.frequency,
        input.groupSize,
        input.openSeats,
        input.vc,
        input.beginners ? 1 : 0,
        input.trial ? 1 : 0,
        JSON.stringify(input.styles),
        input.applicationUrl,
        input.expiresOn,
        timestamp,
        row.id,
      ),
      c.env.DB.prepare("DELETE FROM listing_reports WHERE listing_id = ?").bind(row.id),
      c.env.DB.prepare(
        `INSERT INTO product_events (name, session_id, listing_id, day, created_at, is_qa)
           VALUES ('listing_updated', ?, ?, ?, ?, ?)`,
      ).bind(sessionId, row.id, day(), timestamp, qaFrom(c.req.raw)),
    ]);
    c.header("Cache-Control", "no-store");
    return c.json({ ok: true });
  } catch {
    return c.json({ error: "invalid_request" }, 400);
  }
});

app.post("/api/listings/:slug/close", async (c) => {
  if (!validRequestBoundary(c.req.raw, 128)) return c.json({ error: "invalid_request" }, 400);
  const sessionId = sessionFrom(c.req.raw);
  const slug = c.req.param("slug");
  const row =
    sessionId && slugPattern.test(slug) ? await authorizedListing(c.req.raw, c.env.DB, slug) : null;
  if (!row) return c.json({ error: "not_found" }, 404);
  const timestamp = nowSeconds();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE listings SET status = 'closed', updated_at = ? WHERE id = ?").bind(
      timestamp,
      row.id,
    ),
    c.env.DB.prepare(
      `INSERT INTO product_events (name, session_id, listing_id, day, created_at, is_qa)
         VALUES ('listing_closed', ?, ?, ?, ?, ?)`,
    ).bind(sessionId, row.id, day(), timestamp, qaFrom(c.req.raw)),
  ]);
  return c.json({ ok: true });
});

app.delete("/api/listings/:slug", async (c) => {
  const sessionId = sessionFrom(c.req.raw);
  const slug = c.req.param("slug");
  const row =
    sessionId && slugPattern.test(slug) ? await authorizedListing(c.req.raw, c.env.DB, slug) : null;
  if (!row) return c.json({ error: "not_found" }, 404);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM listings WHERE id = ?").bind(row.id),
    c.env.DB.prepare(
      `INSERT INTO product_events (name, session_id, listing_id, day, created_at, is_qa)
         VALUES ('listing_deleted', ?, ?, ?, ?, ?)`,
    ).bind(sessionId, row.id, day(), nowSeconds(), qaFrom(c.req.raw)),
  ]);
  return c.body(null, 204);
});

app.post("/api/listings/:slug/report", async (c) => {
  if (!validRequestBoundary(c.req.raw, 512)) return c.json({ error: "invalid_request" }, 400);
  const sessionId = sessionFrom(c.req.raw);
  const slug = c.req.param("slug");
  if (!sessionId || !slugPattern.test(slug)) return c.json({ error: "invalid_request" }, 400);
  const row = await findListing(c.env.DB, slug, true);
  if (!row) return c.json({ error: "not_found" }, 404);
  try {
    const input = await parseJson(c.req.raw, 512);
    if (
      !isExactObject(input, ["reason"]) ||
      !reportReasons.has(String((input as { reason?: unknown }).reason))
    ) {
      return c.json({ error: "invalid_report" }, 400);
    }
    const fingerprint = await reportFingerprint(
      c.req.raw,
      c.env.REPORT_HASH_KEY,
      row.id,
      sessionId,
    );
    if (!fingerprint) return c.json({ error: "reporting_unavailable" }, 503);
    const timestamp = nowSeconds();
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO listing_reports
       (listing_id, session_id, reporter_hash, reason, created_at, is_qa)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        row.id,
        sessionId,
        fingerprint,
        (input as { reason: string }).reason,
        timestamp,
        qaFrom(c.req.raw),
      )
      .run();
    const reports = await c.env.DB.prepare(
      `SELECT COUNT(DISTINCT session_id) AS count FROM listing_reports
       WHERE listing_id = ? AND is_qa = 0`,
    )
      .bind(row.id)
      .first<{ count: number }>();
    const hidden = (reports?.count ?? 0) >= 3;
    await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE listings SET report_count = ?,
           status = CASE WHEN ? THEN 'hidden' ELSE status END,
           updated_at = CASE WHEN ? THEN ? ELSE updated_at END WHERE id = ?`,
      ).bind(reports?.count ?? 0, hidden ? 1 : 0, hidden ? 1 : 0, timestamp, row.id),
      c.env.DB.prepare(
        `INSERT INTO product_events (name, session_id, listing_id, day, created_at, is_qa)
           VALUES ('listing_reported', ?, ?, ?, ?, ?)`,
      ).bind(sessionId, row.id, day(), timestamp, qaFrom(c.req.raw)),
    ]);
    c.header("Cache-Control", "no-store");
    return c.json({ hidden, ok: true }, 202);
  } catch {
    return c.json({ error: "invalid_request" }, 400);
  }
});

app.post("/api/events", async (c) => {
  if (!validRequestBoundary(c.req.raw, 512)) return c.json({ error: "invalid_request" }, 400);
  const sessionId = sessionFrom(c.req.raw);
  if (!sessionId) return c.json({ error: "invalid_request" }, 400);
  try {
    const input = await parseJson(c.req.raw, 512);
    if (!isExactObject(input, ["listingId", "name"]))
      return c.json({ error: "invalid_event" }, 400);
    const { listingId, name } = input as { listingId: unknown; name: unknown };
    if (
      typeof name !== "string" ||
      !browserEventNames.has(name) ||
      typeof listingId !== "string" ||
      (listingId !== "" && !uuidPattern.test(listingId))
    ) {
      return c.json({ error: "invalid_event" }, 400);
    }
    await insertEvent(c.env.DB, name, sessionId, listingId, qaFrom(c.req.raw));
    c.header("Cache-Control", "no-store");
    return c.json({ ok: true }, 202);
  } catch {
    return c.json({ error: "invalid_request" }, 400);
  }
});

app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) return c.json({ error: "not_found" }, 404);
  c.status(404);
  return c.render(
    <Layout description="指定された募集札は見つかりません。" noindex title="見つかりません｜仲間札">
      <main class="not-found" id="main">
        <div class="empty-seat" aria-hidden="true">
          <i></i>
          <span>404</span>
        </div>
        <p class="eyebrow">NO TABLE HERE</p>
        <h1>その募集卓は、閉じています</h1>
        <p>期限が過ぎたか、募集主が終了した可能性があります。</p>
        <a class="primary-button" href="/list">
          ほかの募集を探す
        </a>
      </main>
    </Layout>,
  );
});

const scheduled: ExportedHandlerScheduledHandler<Bindings> = async (_event, env) => {
  const now = nowSeconds();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM product_events WHERE created_at <= ?").bind(now - eventLifetime),
    env.DB.prepare(
      "UPDATE listings SET status = 'closed', updated_at = ? WHERE status = 'active' AND expires_on < ?",
    ).bind(now, day()),
    env.DB.prepare(
      "DELETE FROM listings WHERE status IN ('closed', 'hidden') AND updated_at <= ?",
    ).bind(now - inactiveLifetime),
  ]);
};

export { app, eventNames, scheduled, validHttpsUrl, validListingInput };

export default {
  fetch: app.fetch,
  scheduled,
} satisfies ExportedHandler<Bindings>;

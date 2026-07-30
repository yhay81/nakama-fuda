const storageKey = "nakama-fuda-session";
const visitKey = "nakama-fuda-visited";

const fallbackUuid = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export const sessionId = (() => {
  const saved = localStorage.getItem(storageKey);
  if (saved) return saved;
  const created = crypto.randomUUID ? crypto.randomUUID() : fallbackUuid();
  localStorage.setItem(storageKey, created);
  return created;
})();

export const isQa = new URLSearchParams(location.search).get("qa") === "1";

export const jsonHeaders = (extra = {}) => ({
  "content-type": "application/json",
  "x-nakama-fuda-session": sessionId,
  ...(isQa ? { "x-nakama-fuda-qa": "1" } : {}),
  ...extra,
});

export const capabilityFromHash = () => {
  const capability = location.hash.slice(1);
  return /^[A-Za-z0-9_-]{43}$/.test(capability) ? capability : "";
};

export const sendEvent = (name, listingId = "") =>
  fetch("/api/events", {
    body: JSON.stringify({ listingId, name }),
    headers: jsonHeaders(),
    method: "POST",
  }).catch(() => undefined);

export const markVisit = (name = "visited", listingId = "") => {
  void sendEvent(name, listingId);
  if (localStorage.getItem(visitKey)) void sendEvent("returned", listingId);
  localStorage.setItem(visitKey, new Date().toISOString().slice(0, 10));
};

export const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, options);
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "request_failed");
  return data;
};

export const errorText = (code) =>
  ({
    daily_limit: "今日は2件まで公開できます。続きは明日お試しください。",
    invalid_listing:
      "入力を確かめてください。連絡先は応募先URLに分け、期限は7〜90日後にしてください。",
    not_found: "編集鍵が一致しないか、募集札はすでに削除されています。",
  })[code] || "うまく保存できませんでした。少し待ってもう一度お試しください。";

export const copyInput = async (input, button) => {
  await navigator.clipboard.writeText(input.value);
  const prior = button.textContent;
  button.textContent = "コピー済み";
  setTimeout(() => {
    button.textContent = prior;
  }, 1500);
};

export const formInput = (form) => {
  const data = new FormData(form);
  return {
    activityTime: String(data.get("activityTime") || ""),
    applicationUrl: String(data.get("applicationUrl") || "").trim(),
    beginners: data.get("beginners") === "on",
    description: String(data.get("description") || "").trim(),
    expiresOn: String(data.get("expiresOn") || ""),
    frequency: String(data.get("frequency") || ""),
    gameName: String(data.get("gameName") || "").trim(),
    groupName: String(data.get("groupName") || "").trim(),
    groupSize: Number(data.get("groupSize")),
    headline: String(data.get("headline") || "").trim(),
    openSeats: Number(data.get("openSeats")),
    platform: String(data.get("platform") || ""),
    serverName: String(data.get("serverName") || "").trim(),
    styles: data.getAll("styles").map(String),
    trial: data.get("trial") === "on",
    vc: String(data.get("vc") || ""),
  };
};

export const populateForm = (form, listing) => {
  for (const [name, value] of Object.entries(listing)) {
    if (name === "styles") {
      for (const input of form.querySelectorAll('input[name="styles"]')) {
        input.checked = value.includes(input.value);
      }
      continue;
    }
    const field = form.elements.namedItem(name);
    if (!field) continue;
    if (field instanceof HTMLInputElement && field.type === "checkbox") {
      field.checked = Boolean(value);
    } else {
      field.value = String(value);
    }
  }
};

export const setDateBounds = (form) => {
  const field = form.elements.namedItem("expiresOn");
  if (!(field instanceof HTMLInputElement)) return;
  const now = Date.now();
  field.min = new Date(now + 7 * 86400000).toISOString().slice(0, 10);
  field.max = new Date(now + 90 * 86400000).toISOString().slice(0, 10);
  if (!field.value) field.value = new Date(now + 30 * 86400000).toISOString().slice(0, 10);
};

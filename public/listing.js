import { jsonHeaders, markVisit, sendEvent } from "/common.js";

const root = document.querySelector("[data-listing-root]");
const listingId = root.dataset.listingId;
const slug = root.dataset.slug;

root.querySelector("[data-outbound]").addEventListener("click", () => {
  void sendEvent("outbound_opened", listingId);
});

const reportForm = root.querySelector("[data-report-form]");
reportForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const state = reportForm.querySelector("[data-report-state]");
  state.textContent = "報告を送っています…";
  const reason = String(new FormData(reportForm).get("reason") || "");
  try {
    const response = await fetch(`/api/listings/${slug}/report`, {
      body: JSON.stringify({ reason }),
      headers: jsonHeaders(),
      method: "POST",
    });
    if (!response.ok) throw new Error();
    state.textContent = "報告を受け付けました。";
    reportForm.querySelector("button").disabled = true;
  } catch {
    state.textContent = "報告を送れませんでした。時間を置いてお試しください。";
  }
});

markVisit("listing_opened", listingId);

import {
  capabilityFromHash,
  errorText,
  fetchJson,
  formInput,
  jsonHeaders,
  markVisit,
  populateForm,
  setDateBounds,
} from "/common.js";

const root = document.querySelector("[data-editor-root]");
const status = root.querySelector("[data-editor-status]");
const content = root.querySelector("[data-editor-content]");
const form = root.querySelector("[data-listing-form]");
const state = form.querySelector("[data-form-state]");
const slug = root.dataset.slug;
const capability = capabilityFromHash();
const headers = () => jsonHeaders({ "x-nakama-fuda-capability": capability });

const load = async () => {
  if (!capability) throw new Error("not_found");
  const data = await fetchJson(`/api/listings/${slug}`, { headers: headers() });
  setDateBounds(form);
  populateForm(form, data.listing);
  status.hidden = true;
  content.hidden = false;
  markVisit("returned");
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  state.textContent = "募集札を更新しています…";
  try {
    await fetchJson(`/api/listings/${slug}`, {
      body: JSON.stringify(formInput(form)),
      headers: headers(),
      method: "PUT",
    });
    state.textContent = "公開一覧へ反映しました。";
  } catch (error) {
    state.textContent = errorText(error.message);
  }
});

root.querySelector('[data-action="close"]').addEventListener("click", async () => {
  if (!confirm("募集を終了し、公開一覧から外しますか？")) return;
  try {
    await fetchJson(`/api/listings/${slug}/close`, {
      body: "{}",
      headers: headers(),
      method: "POST",
    });
    status.hidden = false;
    status.textContent = "募集を終了しました。内容を更新保存すると再公開できます。";
  } catch (error) {
    status.hidden = false;
    status.textContent = errorText(error.message);
  }
});

root.querySelector('[data-action="delete"]').addEventListener("click", async () => {
  if (!confirm("募集札を削除します。元に戻せません。続けますか？")) return;
  try {
    await fetchJson(`/api/listings/${slug}`, { headers: headers(), method: "DELETE" });
    content.hidden = true;
    status.hidden = false;
    status.textContent = "募集札を削除しました。";
  } catch (error) {
    status.hidden = false;
    status.textContent = errorText(error.message);
  }
});

load().catch((error) => {
  status.textContent = errorText(error.message);
  status.classList.add("error");
});

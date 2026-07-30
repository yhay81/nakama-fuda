import {
  copyInput,
  errorText,
  fetchJson,
  formInput,
  jsonHeaders,
  markVisit,
  setDateBounds,
} from "/common.js";

const form = document.querySelector("[data-listing-form]");
const state = form.querySelector("[data-form-state]");
const dialog = document.querySelector("[data-result-dialog]");
setDateBounds(form);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  state.textContent = "募集卓を用意しています…";
  try {
    const result = await fetchJson("/api/listings", {
      body: JSON.stringify(formInput(form)),
      headers: jsonHeaders(),
      method: "POST",
    });
    dialog.querySelector("[data-public-url]").value = result.publicUrl;
    dialog.querySelector("[data-edit-url]").value = result.editUrl;
    dialog.querySelector("[data-open-public]").href = result.publicUrl;
    dialog.querySelector("[data-open-editor]").href = result.editUrl;
    state.textContent = "";
    dialog.showModal();
  } catch (error) {
    state.textContent = errorText(error.message);
  }
});

for (const button of dialog.querySelectorAll("[data-copy]")) {
  button.addEventListener("click", () => {
    const input = dialog.querySelector(`[data-${button.dataset.copy}-url]`);
    void copyInput(input, button);
  });
}

dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});

if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");
markVisit();

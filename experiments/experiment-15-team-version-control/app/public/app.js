import { ITEMS, searchCatalog } from "/modules/catalog.mjs";
import { createLoan, returnLoan } from "/modules/loans.mjs";
import { summarize } from "/modules/insights.mjs";

const $ = id => document.getElementById(id);
const storageKey = "kitcrew.workspace.v1";
let loans = [];
let currentView = "catalog";
let loanFilter = "active";
let storageWorking = true;
let savedDataInvalid = false;
let toastTimer;

const illustrations = {
  camera: '<rect x="18" y="31" width="121" height="76" rx="11" fill="#173452"/><path d="M39 31v-9a5 5 0 0 1 5-5h35a5 5 0 0 1 5 5v9" fill="#173452"/><rect x="24" y="39" width="109" height="54" rx="6" fill="#d9e8f5"/><circle cx="80" cy="67" r="30" fill="#355a7d" stroke="#9cb8d1" stroke-width="6"/><circle cx="80" cy="67" r="19" fill="#142e49"/><path d="M67 64a14 14 0 0 1 15-12" fill="none" stroke="#6b99bd" stroke-width="4" stroke-linecap="round"/><rect x="112" y="45" width="14" height="8" rx="2" fill="#759abf"/><circle cx="35" cy="53" r="4" fill="#ffcc48"/>',
  mic: '<rect x="26" y="24" width="40" height="69" rx="8" fill="#1a3555"/><rect x="33" y="32" width="26" height="39" rx="3" fill="#345c7a"/><path d="M38 39h16m-16 7h16m-16 7h16m-16 7h16" stroke="#82a2b9" stroke-width="2"/><circle cx="46" cy="82" r="4" fill="#ffcc48"/><rect x="82" y="36" width="44" height="63" rx="8" fill="#e8edf4" stroke="#a4b7cb" stroke-width="2"/><rect x="89" y="45" width="30" height="20" rx="3" fill="#426580"/><path d="M92 56h5l3-7 4 12 4-8h8" stroke="#a7d9eb" stroke-width="2" fill="none"/><circle cx="104" cy="81" r="7" fill="#173452"/><path d="M95 35V20m19 15V15" stroke="#173452" stroke-width="4" stroke-linecap="round"/>',
  light: '<path d="m65 94-19 26m19-26 25 26m-25-26v30" stroke="#173452" stroke-width="5" stroke-linecap="round"/><path d="M65 81v15" stroke="#173452" stroke-width="7"/><rect x="18" y="20" width="105" height="68" rx="7" fill="#173452"/><rect x="26" y="28" width="89" height="51" rx="3" fill="#ffde79"/><path d="M34 36h73M34 45h73M34 54h73M34 63h73M34 72h73M42 31v46M56 31v46M70 31v46M84 31v46M98 31v46" stroke="#fff1bf" stroke-width="2"/><path d="M16 28 6 12h33m86 16 12-16h-31M19 82 8 96h31m84-14 14 14h-32" fill="#44627b"/>',
  tripod: '<path d="M75 44v33M70 73l-34 50m44-50 34 50M76 77v49" stroke="#173452" stroke-width="6" stroke-linecap="round"/><path d="m56 93 19 12 19-12" stroke="#6f97a1" stroke-width="3" fill="none"/><rect x="55" y="23" width="42" height="19" rx="4" fill="#1e4259"/><rect x="61" y="16" width="30" height="10" rx="2" fill="#7198a9"/><path d="m94 31 26 12" stroke="#173452" stroke-width="5" stroke-linecap="round"/><path d="M39 121h-9m89 0h-9m-30 4H70" stroke="#132b43" stroke-width="5" stroke-linecap="round"/><circle cx="77" cy="55" r="6" fill="#ffcc48"/>',
  recorder: '<path d="m61 24-12-13m23 13L87 10" stroke="#173452" stroke-width="8" stroke-linecap="round"/><rect x="45" y="24" width="48" height="91" rx="9" fill="#173452"/><rect x="51" y="33" width="36" height="29" rx="3" fill="#93b9d4"/><path d="M55 49h6l3-9 4 17 5-13 4 8h6" stroke="#315772" stroke-width="2" fill="none"/><circle cx="69" cy="83" r="13" fill="#446680"/><circle cx="69" cy="83" r="6" fill="#fcba64"/><path d="M56 106h26" stroke="#82a3bb" stroke-width="3" stroke-linecap="round"/><rect x="38" y="39" width="7" height="17" rx="2" fill="#315570"/>',
  backdrop: '<path d="M23 26h112M31 26v80m96-80v80M31 104l-13 18m13-18 15 18m81-18-15 18m15-18 13 18" stroke="#173452" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M44 27h72v73c0 12 4 16 10 18H44z" fill="#faf3ee" stroke="#e3c1c1" stroke-width="2"/><path d="M44 100h72c0 8 4 14 10 18H44z" fill="#e7cfcb"/><path d="M44 27h72" stroke="#c4918f" stroke-width="5"/><circle cx="31" cy="66" r="3" fill="#ffcc48"/><circle cx="127" cy="66" r="3" fill="#ffcc48"/>'
};

function iconSVG(kind) {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 155 135" aria-hidden="true" focusable="false">' + (illustrations[kind] || illustrations.camera) + "</svg>";
}
function node(tag, className, text) {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}
function toast(message) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $("toast").hidden = true; }, 4200);
}
function available(item) {
  return item.total - loans.filter(loan => loan.itemId === item.id && loan.status === "active").reduce((total, loan) => total + loan.quantity, 0);
}
function formatDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(date);
}
function setStorageLabel() {
  const label = document.querySelector(".loan-toolbar > p");
  label.replaceChildren(node("span", "status-dot"), document.createTextNode(storageWorking ? "Saved in this browser" : "Session only · browser storage unavailable"));
}
function persist() {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ version: 1, loans }));
    storageWorking = true;
    setStorageLabel();
    return true;
  } catch {
    storageWorking = false;
    setStorageLabel();
    return false;
  }
}
function restore() {
  let raw;
  try { raw = localStorage.getItem(storageKey); }
  catch { storageWorking = false; return; }
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.loans) || parsed.loans.length > 1000) throw new Error("Unrecognized saved workspace.");
    summarize(ITEMS, parsed.loans);
    loans = parsed.loans;
  } catch {
    savedDataInvalid = true;
    const message = node("span", "", "Saved KitCrew records could not be restored. Reset this demo to start again; your stored records have not been overwritten.");
    const button = node("button", "secondary-button", "Reset KitCrew");
    button.addEventListener("click", () => $("resetDialog").showModal());
    $("appError").replaceChildren(message, button);
    $("appError").hidden = false;
  }
}
function setView(view, scroll = true) {
  if (!["catalog", "loans", "insights"].includes(view)) return;
  currentView = view;
  for (const name of ["catalog", "loans", "insights"]) $(name + "View").hidden = name !== view;
  for (const button of document.querySelectorAll("[data-view]")) {
    const active = button.dataset.view === view;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  if (scroll) $("workspace").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
}
function makeItemCard(item, index) {
  const remaining = available(item);
  const card = node("article", "equipment-card");
  card.style.setProperty("--card-tint", item.color);
  const art = node("div", "equipment-art");
  art.innerHTML = iconSVG(item.icon);
  art.append(node("span", "item-code", "KC / " + String(index + 1).padStart(2, "0")));
  const tag = node("span", "availability-tag" + (remaining === 0 ? " unavailable" : ""));
  if (remaining) tag.append(node("span", "status-dot"));
  tag.append(document.createTextNode(remaining ? "READY TO GO" : "ALL CHECKED OUT"));
  art.append(tag);
  const body = node("div", "equipment-body");
  body.append(node("span", "equipment-category", item.category), node("h3", "", item.name), node("p", "", item.description));
  const bottom = node("div", "equipment-bottom");
  const stock = node("span", "stock-info");
  stock.append(node("strong", "", String(remaining)), document.createTextNode("/ " + item.total + " available"));
  const borrow = node("button", "borrow-button", remaining ? "Borrow this kit" : "Out with the crew");
  borrow.type = "button";
  borrow.setAttribute("aria-label", "Borrow " + item.name);
  borrow.disabled = remaining === 0 || savedDataInvalid;
  borrow.append(node("span", "", "↗"));
  borrow.addEventListener("click", () => openBorrow(item.id));
  bottom.append(stock, borrow);
  body.append(bottom);
  card.append(art, body);
  return card;
}
function renderCatalog() {
  const filtered = searchCatalog(ITEMS, { query: $("catalogSearch").value, category: $("categoryFilter").value });
  $("catalogGrid").replaceChildren(...filtered.map(item => makeItemCard(item, ITEMS.indexOf(item))));
  $("catalogEmpty").hidden = filtered.length !== 0;
  $("resultCount").textContent = filtered.length + " / " + ITEMS.length + " KITS IN VIEW";
}
function renderLoans() {
  const shown = loans.filter(loan => loan.status === loanFilter).slice().sort((a, b) => (loanFilter === "active" ? Date.parse(a.dueAt) - Date.parse(b.dueAt) : Date.parse(b.returnedAt || b.borrowedAt) - Date.parse(a.returnedAt || a.borrowedAt)));
  $("activeFilterCount").textContent = String(loans.filter(loan => loan.status === "active").length);
  $("returnedFilterCount").textContent = String(loans.filter(loan => loan.status === "returned").length);
  $("loansEmpty").hidden = shown.length !== 0;
  $("loansEmptyText").textContent = loanFilter === "active" ? "Your crew's borrowed equipment will appear here." : "Returned equipment will appear here after its next handoff.";
  $("loanList").replaceChildren(...shown.map(loan => {
    const item = ITEMS.find(candidate => candidate.id === loan.itemId);
    const row = node("article", "loan-row");
    row.style.setProperty("--card-tint", item.color);
    const itemGroup = node("div", "loan-item");
    const itemIcon = node("span", "loan-item-icon");
    itemIcon.innerHTML = iconSVG(item.icon);
    const description = node("div");
    description.append(node("h3", "", item.name), node("p", "", loan.quantity + (loan.quantity === 1 ? " unit" : " units") + " · checked out " + formatDate(loan.borrowedAt)));
    itemGroup.append(itemIcon, description);
    const person = node("div", "loan-person");
    person.append(node("span", "loan-label", "WITH THE CREW"), node("h3", "", typeof loan.borrower === "string" ? loan.borrower : "Crew member"), node("p", "", typeof loan.team === "string" ? loan.team : "Team project"));
    const due = node("div", "loan-due");
    const isOverdue = loan.status === "active" && Date.parse(loan.dueAt) < Date.now();
    due.append(node("span", "loan-label", loan.status === "returned" ? "HANDED BACK" : "DUE BACK"), node("h3", isOverdue ? "overdue-label" : "", formatDate(loan.status === "returned" ? (loan.returnedAt || loan.dueAt) : loan.dueAt)), node("p", isOverdue ? "overdue-label" : "", loan.status === "returned" ? "Ready for the next idea" : (isOverdue ? "Overdue · please return this kit" : "Thanks for keeping it moving")));
    row.append(itemGroup, person, due);
    if (loan.status === "active") {
      const button = node("button", "return-button", "Return equipment ↶");
      button.type = "button";
      button.setAttribute("aria-label", "Return " + item.name + " borrowed by " + (loan.borrower || "crew member"));
      button.addEventListener("click", () => completeReturn(loan.id));
      row.append(button);
    } else row.append(node("span", "returned-label", "✓ Returned"));
    return row;
  }));
}
function renderInsights(summary) {
  $("totalUnits").textContent = String(summary.totalUnits).padStart(2, "0");
  $("availableUnits").textContent = String(summary.availableUnits).padStart(2, "0");
  $("activeLoans").textContent = String(summary.activeLoans).padStart(2, "0");
  $("navLoanCount").textContent = String(summary.activeLoans);
  $("utilizationValue").textContent = String(summary.utilizationPercent);
  $("utilizationBar").value = summary.utilizationPercent;
  $("utilizationText").textContent = summary.borrowedUnits + " of " + summary.totalUnits + " equipment units are out with the crew. " + summary.availableUnits + " are ready for the next idea.";
  $("categoryBars").replaceChildren(...summary.byCategory.map(category => {
    const container = node("div", "category-bar");
    const heading = node("div", "category-bar-heading");
    heading.append(node("span", "", category.category), node("span", "", category.borrowed + " / " + category.total + " in use"));
    const track = node("div", "category-track");
    track.setAttribute("role", "meter");
    track.setAttribute("aria-label", category.category + " borrowed units");
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", String(category.total));
    track.setAttribute("aria-valuenow", String(category.borrowed));
    const bar = node("span");
    bar.style.width = (category.total ? category.borrowed / category.total * 100 : 0) + "%";
    track.append(bar);
    container.append(heading, track);
    return container;
  }));
  $("overdueHeadline").textContent = summary.overdueLoans ? summary.overdueLoans + (summary.overdueLoans === 1 ? " loan needs a nudge." : " loans need a nudge.") : "All in good time.";
  $("overdueText").textContent = summary.overdueLoans ? "A few pieces are due back. Review the loans and keep your team's equipment circulating." : "No overdue loans. Thanks for keeping the kit moving.";
}
function renderAll() {
  const summary = summarize(ITEMS, loans);
  renderInsights(summary);
  renderCatalog();
  renderLoans();
}
function openBorrow(itemId) {
  if (savedDataInvalid) return;
  const item = ITEMS.find(candidate => candidate.id === itemId);
  const selection = node("div");
  selection.append(node("h3", "", item.name), node("p", "", available(item) + " available · " + item.category));
  const icon = node("span", "selected-icon");
  icon.innerHTML = iconSVG(item.icon);
  $("selectedEquipment").replaceChildren(icon, selection);
  $("borrowForm").reset();
  $("borrowItemId").value = item.id;
  $("loanQuantity").max = String(Math.min(3, available(item)));
  $("borrowError").hidden = true;
  $("borrowDialog").showModal();
  $("borrowerName").focus();
}
function confirmBorrow(event) {
  event.preventDefault();
  try {
    const loan = createLoan({
      itemId: $("borrowItemId").value,
      quantity: $("loanQuantity").value === "" ? null : Number($("loanQuantity").value),
      days: $("loanDays").value === "" ? null : Number($("loanDays").value),
      team: $("teamName").value,
      borrower: $("borrowerName").value
    }, loans, ITEMS);
    loans = [...loans, loan];
    const saved = persist();
    $("borrowDialog").close();
    loanFilter = "active";
    for (const button of document.querySelectorAll("[data-loan-filter]")) {
      const active = button.dataset.loanFilter === loanFilter;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    }
    renderAll();
    setView("loans");
    toast(saved ? "Good handoff! Your loan is saved and availability is updated." : "Loan recorded for this session. Browser storage is unavailable; export it before leaving.");
  } catch (error) {
    $("borrowError").textContent = error.message || "The handoff could not be recorded. Check the details and try again.";
    $("borrowError").hidden = false;
  }
}
function completeReturn(id) {
  try {
    loans = returnLoan(id, loans);
    const saved = persist();
    renderAll();
    toast(saved ? "Thanks for the handoff. Your equipment is available again." : "Equipment returned for this session. Export the workspace before leaving.");
  } catch (error) { toast(error.message || "The return could not be recorded."); }
}
function resetWorkspace() {
  loans = [];
  savedDataInvalid = false;
  let cleared = true;
  try { localStorage.removeItem(storageKey); storageWorking = true; } catch { cleared = false; storageWorking = false; }
  $("appError").hidden = true;
  $("catalogSearch").value = "";
  $("categoryFilter").value = "all";
  loanFilter = "active";
  for (const button of document.querySelectorAll("[data-loan-filter]")) {
    const active = button.dataset.loanFilter === loanFilter;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  setStorageLabel();
  renderAll();
  $("resetDialog").close();
  setView("catalog");
  toast(cleared ? "Fresh start! Demo loans cleared and all equipment is available." : "Session reset. Browser storage could not be cleared.");
}
function exportWorkspace() {
  const exported = {
    application: "KitCrew", schemaVersion: 1, exportedAt: new Date().toISOString(),
    note: "Local equipment-sharing demo. These records are not real reservations.",
    inventory: ITEMS, loans, summary: summarize(ITEMS, loans)
  };
  const blob = new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = node("a");
  link.href = url;
  link.download = "kitcrew-workspace.json";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast("Workspace exported with your equipment, loans and summary.");
}

try {
  for (const category of [...new Set(ITEMS.map(item => item.category))]) {
    const option = node("option", "", category);
    option.value = category;
    $("categoryFilter").append(option);
  }
  restore();
  setStorageLabel();
  renderAll();
  for (const button of document.querySelectorAll("[data-view]")) button.addEventListener("click", () => setView(button.dataset.view));
  for (const button of document.querySelectorAll("[data-loan-filter]")) button.addEventListener("click", () => {
    loanFilter = button.dataset.loanFilter;
    for (const other of document.querySelectorAll("[data-loan-filter]")) {
      const active = other === button;
      other.classList.toggle("active", active);
      other.setAttribute("aria-pressed", String(active));
    }
    renderLoans();
  });
  $("catalogSearch").addEventListener("input", renderCatalog);
  $("categoryFilter").addEventListener("change", renderCatalog);
  $("clearFilters").addEventListener("click", () => { $("catalogSearch").value = ""; $("categoryFilter").value = "all"; renderCatalog(); $("catalogSearch").focus(); });
  $("borrowForm").addEventListener("submit", confirmBorrow);
  document.querySelector(".close-dialog").addEventListener("click", () => $("borrowDialog").close());
  $("browseFromLoans").addEventListener("click", () => setView("catalog"));
  $("reviewLoans").addEventListener("click", () => {
    loanFilter = "active";
    for (const button of document.querySelectorAll("[data-loan-filter]")) {
      const active = button.dataset.loanFilter === "active";
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    }
    renderLoans();
    setView("loans");
  });
  $("resetWorkspace").addEventListener("click", () => $("resetDialog").showModal());
  $("cancelReset").addEventListener("click", () => $("resetDialog").close());
  $("confirmReset").addEventListener("click", resetWorkspace);
  $("exportWorkspace").addEventListener("click", exportWorkspace);
  document.querySelector(".primary-link").addEventListener("click", () => setView("catalog", false));
  for (const homeLink of document.querySelectorAll(".brand")) homeLink.addEventListener("click", () => setView("catalog", false));
  document.addEventListener("keydown", event => {
    if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName) && !$("borrowDialog").open && !$("resetDialog").open) {
      event.preventDefault();
      setView("catalog");
      $("catalogSearch").focus();
    }
  });
  window.addEventListener("storage", event => {
    if (event.key === storageKey || event.key === null) {
      loans = [];
      savedDataInvalid = false;
      $("appError").hidden = true;
      restore();
      setStorageLabel();
      renderAll();
      if (!savedDataInvalid) toast("Workspace refreshed from another browser tab.");
    }
  });
} catch (error) {
  $("appError").textContent = "KitCrew could not start. " + (error.message || "Reload the page and try again.");
  $("appError").hidden = false;
}

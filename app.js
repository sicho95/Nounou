import {
  DATA_VERSION,
  calculateCmg,
  calculateDeclaration,
  calculateEnd,
  contractBasis,
  defaultState,
  leaveSummary,
  money,
  monthLabel,
  number,
  referencePeriod,
  round
} from "./core.mjs";

const STORAGE_KEY = "nounoucalc_v2";
const DB_NAME = "nounoucalc-cold-storage";
const DB_VERSION = 1;
const MAX_COLD_SNAPSHOTS = 30;
const BUILD_STORAGE_KEY = "nounoucalc_last_build";
const PENDING_DRAFT_KEY = "nounoucalc_pending_draft";
const THEME_STORAGE_KEY = "nounoucalc_theme";
const THEME_ORDER = ["auto", "light", "dark"];
const NOTICE_DEFAULT = "Vérifiez le récapitulatif Urssaf avant validation.";
const clone = value => globalThis.structuredClone
  ? globalThis.structuredClone(value)
  : JSON.parse(JSON.stringify(value));
const $ = id => document.getElementById(id);
const contractIds = [
  "startDate", "contractType", "weeksPerYear", "daysPerWeek", "normalHoursPerWeek",
  "majorHoursPerWeek", "netHourlyRate", "grossHourlyRate", "majorMarkup",
  "complementaryMarkup", "maintenanceRate", "mealRate", "cpPaymentMode", "cpPaymentMonth"
];
const adminIds = [
  "employerName", "employerPajemploi", "employerAddress", "employeeName", "employeeNumber",
  "employeeAddress", "approvalNumber", "childName", "childBirthDate"
];
const cmgIds = ["annualResourcesN2", "dependentChildren", "aeeh"];
const monthlyIds = [
  "period", "paymentDate", "actualDays", "meals", "equivalentWeeks", "complementaryHours",
  "extraMajorHours", "absenceDeductionNet", "otherSalaryNet", "cpDaysDeclared", "cpPaidNet",
  "cpReferenceKey",
  "kilometerAllowance", "advancePaid", "specificHours", "over24Hours", "disabilityCare",
  "officialGross", "officialCmg", "officialPajemploiDebit", "monthNote"
];

let state = loadState();
let currentRecord = null;
let currentSimulationId = null;

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (parsed?.version === DATA_VERSION) return parsed;
    if (parsed?.version === 2) return upgradeV2(parsed);
  } catch (error) {
    console.warn("Sauvegarde illisible", error);
  }
  return migrateLegacy();
}

function openColdDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("state")) database.createObjectStore("state");
      if (!database.objectStoreNames.contains("snapshots")) database.createObjectStore("snapshots");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function persistColdState(snapshot = true) {
  if (!("indexedDB" in globalThis)) return;
  try {
    const database = await openColdDatabase();
    const transaction = database.transaction(["state", "snapshots"], "readwrite");
    transaction.objectStore("state").put(clone(state), "latest");
    if (snapshot) transaction.objectStore("snapshots").put(clone(state), state.updatedAt);
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    if (snapshot) await trimColdSnapshots(database);
    database.close();
  } catch (error) {
    console.warn("Sauvegarde IndexedDB indisponible", error);
  }
}

async function trimColdSnapshots(database) {
  await new Promise((resolve, reject) => {
    const transaction = database.transaction("snapshots", "readwrite");
    const store = transaction.objectStore("snapshots");
    const request = store.getAllKeys();
    request.onsuccess = () => {
      const obsolete = request.result
        .sort()
        .slice(0, Math.max(0, request.result.length - MAX_COLD_SNAPSHOTS));
      obsolete.forEach(key => store.delete(key));
    };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

async function hydrateFromColdStorage() {
  if (!("indexedDB" in globalThis)) return;
  try {
    const database = await openColdDatabase();
    const coldState = await new Promise((resolve, reject) => {
      const request = database.transaction("state").objectStore("state").get("latest");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    if (!coldState?.version) {
      await persistColdState(false);
      return;
    }
    if ((coldState.updatedAt || "") > (state.updatedAt || "")) {
      state = coldState.version === DATA_VERSION ? coldState : upgradeV2(coldState);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      fillContract();
      renderHistory();
      loadMonth($("period").value || currentMonth());
      toast("Données restaurées depuis la sauvegarde locale sécurisée.");
    }
  } catch (error) {
    console.warn("Restauration IndexedDB indisponible", error);
  }
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function upgradeV2(oldState) {
  const upgraded = {
    ...defaultState(),
    ...oldState,
    version: DATA_VERSION,
    cmgProfile: oldState.cmgProfile || defaultState().cmgProfile,
    preferences: oldState.preferences || defaultState().preferences,
    declarations: {}
  };
  for (const [period, record] of Object.entries(oldState.declarations || {})) {
    const id = makeId();
    upgraded.declarations[period] = { simulations: [{ ...record, id, status: "simulation" }], officialId: null };
  }
  return upgraded;
}

function migrateLegacy() {
  const fresh = defaultState();
  try {
    const oldConfig = JSON.parse(localStorage.getItem("nounou_cfg") || "null");
    const oldAdmin = JSON.parse(localStorage.getItem("nounou_admin") || "null");
    if (oldConfig) {
      fresh.contract.weeksPerYear = number(oldConfig.semAn, 46);
      fresh.contract.normalHoursPerWeek = number(oldConfig.hNormales, 40);
      fresh.contract.majorHoursPerWeek = number(oldConfig.hSupp);
      fresh.contract.netHourlyRate = number(oldConfig.taux, 4);
      fresh.contract.majorMarkup = number(oldConfig.majSupp, 25);
      fresh.contract.complementaryMarkup = number(oldConfig.majCompl);
      fresh.contract.maintenanceRate = number(oldConfig.txIE, 3.8);
      fresh.contract.mealRate = number(oldConfig.txIR, 4);
    }
    if (oldAdmin) {
      fresh.contract.startDate = oldAdmin.salDateEmbauche || "";
      fresh.admin.employerName = [oldAdmin.empPrenom, oldAdmin.empNom].filter(Boolean).join(" ");
      fresh.admin.employerPajemploi = oldAdmin.empPajemploi || "";
      fresh.admin.employeeName = [oldAdmin.salPrenom, oldAdmin.salNom].filter(Boolean).join(" ");
      fresh.admin.employeeNumber = oldAdmin.salSecu || "";
      fresh.admin.childName = oldAdmin.enfantPrenom || "Noa";
      fresh.admin.childBirthDate = oldAdmin.enfantNaissance || "";
    }
  } catch (error) {
    console.warn("Migration V1 impossible", error);
  }
  return fresh;
}

function saveState(snapshot = true) {
  state.version = DATA_VERSION;
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  void persistColdState(snapshot);
}

function applyTheme(preference, persist = false) {
  const selected = THEME_ORDER.includes(preference) ? preference : "auto";
  const darkSystem = matchMedia("(prefers-color-scheme: dark)").matches;
  const effective = selected === "auto" ? (darkSystem ? "dark" : "light") : selected;
  const labels = {
    auto: ["◐", "Thème automatique"],
    light: ["☀︎", "Thème clair"],
    dark: ["☾", "Thème sombre"]
  };
  document.documentElement.dataset.theme = selected;
  document.documentElement.dataset.themeEffective = effective;
  $("themeIcon").textContent = labels[selected][0];
  $("themeToggle").setAttribute("aria-label", labels[selected][1]);
  $("themeToggle").title = `${labels[selected][1]} — toucher pour changer`;
  document.querySelector('meta[name="theme-color"]').content = effective === "dark" ? "#000000" : "#0a84ff";
  if (persist) {
    state.preferences = { ...(state.preferences || {}), theme: selected };
    localStorage.setItem(THEME_STORAGE_KEY, selected);
    saveState(false);
    toast(labels[selected][1]);
  }
}

function cycleTheme() {
  const current = document.documentElement.dataset.theme || "auto";
  applyTheme(THEME_ORDER[(THEME_ORDER.indexOf(current) + 1) % THEME_ORDER.length], true);
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function lastDay(period) {
  const [year, month] = period.split("-").map(Number);
  return `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`;
}

function setValue(id, value) {
  const element = $(id);
  if (!element) return;
  if (element.type === "checkbox") element.checked = Boolean(value);
  else element.value = value ?? "";
}

function readValues(ids) {
  return Object.fromEntries(ids.map(id => [id, $(id).type === "checkbox" ? $(id).checked : $(id).value]));
}

function fillContract() {
  contractIds.forEach(id => setValue(id, state.contract[id]));
  adminIds.forEach(id => setValue(id, state.admin[id]));
  cmgIds.forEach(id => setValue(id, state.cmgProfile[id]));
  updateContractPreview();
}

function saveContract(showMessage = true) {
  state.contract = { ...state.contract, ...readValues(contractIds) };
  state.admin = { ...state.admin, ...readValues(adminIds) };
  state.cmgProfile = { ...state.cmgProfile, ...readValues(cmgIds) };
  saveState();
  updateContractPreview();
  updatePeriodHints();
  if (showMessage) toast("Contrat enregistré.");
}

function defaultMonthly(period) {
  const weeks = number(state.contract.weeksPerYear, 46) / 12;
  const ref = referencePeriod(period);
  const selectedMonth = number(period.split("-")[1]);
  const paymentMonth = number(state.contract.cpPaymentMonth, 6);
  const paidReferenceKey = state.contract.cpPaymentMode === "june" && selectedMonth === paymentMonth
    ? String(number(ref.key) - 1)
    : ref.key;
  return {
    period,
    paymentDate: lastDay(period),
    actualDays: "",
    meals: "",
    equivalentWeeks: round(weeks, 2),
    complementaryHours: 0,
    extraMajorHours: 0,
    absenceDeductionNet: 0,
    otherSalaryNet: 0,
    cpDaysDeclared: 0,
    cpPaidNet: 0,
    cpReferenceKey: paidReferenceKey,
    kilometerAllowance: 0,
    advancePaid: 0,
    specificHours: "no",
    over24Hours: "no",
    disabilityCare: "no",
    markAsOfficial: false,
    officialGross: "",
    officialCmg: "",
    officialPajemploiDebit: "",
    monthNote: ""
  };
}

function monthBucket(period, create = false) {
  let bucket = state.declarations[period];
  if (!bucket && create) {
    bucket = { simulations: [], officialId: null };
    state.declarations[period] = bucket;
  }
  return bucket;
}

function officialDeclarations() {
  return Object.fromEntries(Object.entries(state.declarations).flatMap(([period, bucket]) => {
    const record = bucket?.simulations?.find(item => item.id === bucket.officialId);
    return record ? [[period, record]] : [];
  }));
}

function loadMonth(period, simulationId = "") {
  const bucket = monthBucket(period);
  const existing = bucket?.simulations?.find(item => item.id === simulationId) ||
    bucket?.simulations?.find(item => item.id === bucket.officialId) ||
    bucket?.simulations?.[bucket.simulations.length - 1];
  const input = existing?.input || defaultMonthly(period);
  fillCpReferenceOptions(period, input.cpReferenceKey);
  monthlyIds.forEach(id => setValue(id, input[id]));
  setValue("markAsOfficial", existing?.id === bucket?.officialId);
  const simulationCount = bucket?.simulations?.length || 0;
  $("monthStatus").textContent = existing?.id === bucket?.officialId
    ? "Validée sur Pajemploi"
    : simulationCount ? `${simulationCount} simulation${simulationCount > 1 ? "s" : ""}` : "Nouveau mois";
  currentRecord = existing || null;
  currentSimulationId = existing?.id || null;
  updatePeriodHints();
  if (existing) renderResults(existing);
  else $("results").classList.add("hidden");
}

function newSimulation() {
  const period = $("period").value || currentMonth();
  const input = defaultMonthly(period);
  fillCpReferenceOptions(period, input.cpReferenceKey);
  monthlyIds.forEach(id => setValue(id, input[id]));
  setValue("markAsOfficial", false);
  currentRecord = null;
  currentSimulationId = null;
  $("monthStatus").textContent = "Nouvelle simulation";
  $("results").classList.add("hidden");
}

function fillCpReferenceOptions(period, selectedKey = "") {
  const currentKey = number(referencePeriod(period).key);
  $("cpReferenceKey").innerHTML = [currentKey - 1, currentKey].map(key =>
    `<option value="${key}">1er juin ${key} – 31 mai ${key + 1}</option>`
  ).join("");
  $("cpReferenceKey").value = selectedKey || String(currentKey);
}

function monthlyInput() {
  return readValues(monthlyIds);
}

function calculateAndSave() {
  saveContract(false);
  const input = monthlyInput();
  if (!input.period) return alert("Choisissez une période.");
  if (state.contract.startDate && `${input.period}-01` < state.contract.startDate.slice(0, 7) + "-01") {
    return alert("La période choisie est antérieure au début du contrat.");
  }
  if (number(state.contract.weeksPerYear) > 52 || number(state.contract.weeksPerYear) === 47) {
    return alert("Choisissez 52 semaines ou 46 semaines et moins, conformément aux catégories conventionnelles.");
  }
  const results = calculateDeclaration(state.contract, input);
  results.cmg = calculateCmg(state.cmgProfile, results);
  results.cmg.officialCmg = number(input.officialCmg);
  results.cmg.officialPajemploiDebit = number(input.officialPajemploiDebit);
  const bucket = monthBucket(input.period, true);
  const id = currentSimulationId || makeId();
  const isOfficial = $("markAsOfficial").checked;
  const record = {
    id,
    input,
    results,
    status: isOfficial ? "official" : "simulation",
    savedAt: new Date().toISOString(),
    validatedAt: isOfficial ? new Date().toISOString() : currentRecord?.validatedAt || null
  };
  const index = bucket.simulations.findIndex(item => item.id === id);
  if (index >= 0) bucket.simulations[index] = record;
  else bucket.simulations.push(record);
  if (isOfficial) {
    bucket.officialId = id;
    bucket.simulations.forEach(item => { if (item.id !== id && item.status === "official") item.status = "simulation"; });
  } else if (bucket.officialId === id) {
    bucket.officialId = null;
  }
  currentRecord = record;
  currentSimulationId = id;
  saveState();
  renderResults(record);
  renderHistory();
  $("monthStatus").textContent = isOfficial ? "Validée sur Pajemploi" : "Simulation enregistrée";
  $("results").classList.remove("hidden");
  $("results").scrollIntoView({ behavior: "smooth", block: "start" });
}

function row(label, value, detail = "") {
  return `<div class="breakdown-row"><span>${label}${detail ? `<small> ${detail}</small>` : ""}</span><strong>${money(value)}</strong></div>`;
}

function renderResults(record) {
  const { input, results } = record;
  const { basis, declared, salary, expenses } = results;
  $("outDeclaredDays").textContent = declared.days;
  $("outExactDays").textContent = `${round(basis.daysExact, 2)} jours contractuels avant arrondi déclaratif`;
  $("outNormalHours").textContent = `${declared.normalHours} h`;
  $("outExactNormalHours").textContent = results.paidLeaveConversion.hours
    ? `${round(basis.normalHoursExact, 2)} h mensualisées + ${round(results.paidLeaveConversion.hours, 2)} h équivalentes de congés`
    : `${round(basis.normalHoursExact, 2)} h contractuelles avant arrondi`;
  $("outComplementaryHours").textContent = `${declared.complementaryHours} h`;
  $("outMajorHours").textContent = `${declared.majorHours} h`;
  $("outMajorBreakdown").textContent = `${basis.declaredContractMajorHours} h mensualisées + ${round(number(input.extraMajorHours), 2)} h en plus`;
  $("outCpDays").textContent = declared.cpDays;
  $("outNetSalary").textContent = money(declared.netSalary);
  const officialCmg = number(results.cmg?.officialCmg);
  const officialDebit = number(results.cmg?.officialPajemploiDebit);
  $("outCmgLabel").textContent = officialCmg ? "CMG rémunération officiel" : "CMG rémunération estimé";
  $("outCmg").textContent = money(officialCmg || results.cmg?.estimatedCmg);
  $("outFamilyCost").textContent = money(officialDebit || results.cmg?.estimatedOutOfPocket);
  $("outCmgDetail").textContent = results.cmg
    ? (officialDebit
      ? "Montant réel prélevé par Pajemploi+"
      : `${results.cmg.hours.toLocaleString("fr-FR")} h prises en compte • tarif réel ${money(results.cmg.actualHourlyCost)}/h`)
    : "Renseignez les ressources CAF dans le contrat";
  $("outMaintenance").textContent = money(expenses.maintenance);
  $("outMeals").textContent = money(expenses.meals);
  $("outKilometers").textContent = money(expenses.kilometers);
  $("outAdvance").textContent = `− ${money(results.advancePaid)}`;
  $("outTotal").textContent = money(results.totalToPay);

  const rate = money(state.contract.netHourlyRate);
  const majorRate = money(number(state.contract.netHourlyRate) * (1 + number(state.contract.majorMarkup) / 100));
  const compRate = money(number(state.contract.netHourlyRate) * (1 + number(state.contract.complementaryMarkup) / 100));
  $("salaryBreakdown").innerHTML = [
    row("Base normale", salary.normalNet, `${round(basis.normalHoursExact, 2)} h × ${rate}`),
    salary.contractMajorNet ? row("Base majorée contractuelle", salary.contractMajorNet, `${round(basis.majorHoursExact, 2)} h × ${majorRate}`) : "",
    salary.complementaryNet ? row("Heures complémentaires", salary.complementaryNet, `${input.complementaryHours} h × ${compRate}`) : "",
    salary.extraMajorNet ? row("Heures majorées supplémentaires", salary.extraMajorNet, `${input.extraMajorHours} h × ${majorRate}`) : "",
    salary.cpPaidNet ? row("Congés payés", salary.cpPaidNet) : "",
    salary.otherSalaryNet ? row("Autre élément de salaire", salary.otherSalaryNet) : "",
    salary.absenceDeductionNet ? row("Déduction d’absence", -salary.absenceDeductionNet) : "",
    row("Salaire net à déclarer", salary.netSalary)
  ].join("");

  const answer = value => value ? "Oui" : "Non";
  $("additionalAnswers").innerHTML = [
    `<div class="breakdown-row"><span>Heures spécifiques</span><strong>${answer(results.additional.specificHours)}</strong></div>`,
    `<div class="breakdown-row"><span>Garde de plus de 24 h consécutives</span><strong>${answer(results.additional.over24Hours)}</strong></div>`,
    `<div class="breakdown-row"><span>Handicap, longue maladie ou inadaptation</span><strong>${answer(results.additional.disabilityCare)}</strong></div>`,
    `<div class="breakdown-row"><span>Fin de contrat</span><strong>Non</strong></div>`
  ].join("");

  const confirmed = officialDeclarations();
  const draft = currentRecord?.id === monthBucket(input.period)?.officialId
    ? null
    : { period: input.period, input, results };
  const summary = leaveSummary(confirmed, input.period, draft);
  $("outReferencePeriod").textContent = summary.reference.label;
  $("outCpAcquired").textContent = summary.acquiredRaw.toLocaleString("fr-FR");
  $("outCpPaid").textContent = summary.paidDays.toLocaleString("fr-FR");
  $("cpProgress").style.width = `${Math.min(100, summary.acquiredRaw / 30 * 100)}%`;
  $("results").classList.remove("hidden");
}

function updateContractPreview() {
  const contract = { ...state.contract, ...readValues(contractIds) };
  const basis = contractBasis(contract);
  const mode = number(contract.weeksPerYear) === 52 ? "accueil sur 52 semaines" : "accueil sur 46 semaines ou moins";
  $("contractPreview").innerHTML =
    `<strong>${mode}</strong><br>` +
    `${basis.daysExact.toLocaleString("fr-FR")} jours/mois → <strong>${basis.declaredDays} jours à déclarer</strong><br>` +
    `${basis.normalHoursExact.toLocaleString("fr-FR")} h normales/mois → <strong>${basis.declaredNormalHours} h à déclarer</strong><br>` +
    `${basis.majorHoursExact.toLocaleString("fr-FR")} h majorées/mois → <strong>${basis.declaredContractMajorHours} h contractuelles à déclarer</strong>`;
}

function updatePeriodHints() {
  const period = $("period").value;
  if (!period) return;
  const bucket = monthBucket(period);
  const count = bucket?.simulations?.length || 0;
  const official = Boolean(bucket?.officialId);
  $("periodHint").textContent = `${monthLabel(period)} • ${count} simulation${count > 1 ? "s" : ""}` +
    (official ? " • déclaration Pajemploi validée." : " • aucune déclaration encore validée.");
  const paymentMonth = number(state.contract.cpPaymentMonth, 6);
  const selectedMonth = number(period.split("-")[1]);
  const weeks = number(state.contract.weeksPerYear);
  const isPaymentMonth = state.contract.cpPaymentMode === "june" && selectedMonth === paymentMonth;
  $("cpMonthPill").textContent = weeks === 52 ? "Inclus à la prise" : (isPaymentMonth ? "Mois de paiement prévu" : "Pas le mois prévu");
  $("cpHint").textContent = weeks === 52
    ? "En accueil sur 52 semaines, les congés sont rémunérés lorsqu’ils sont pris et remplacent le salaire de base."
    : isPaymentMonth
      ? "Le contrat prévoit un versement unique ce mois. Saisissez les jours et le montant calculé au 31 mai."
      : "Ne saisissez un montant que si la modalité contractuelle prévoit un paiement ce mois-ci.";
}

function renderHistory() {
  const entries = Object.entries(state.declarations)
    .flatMap(([period, bucket]) => (bucket.simulations || []).map(record => ({ period, bucket, record })))
    .sort((a, b) => b.period.localeCompare(a.period) || b.record.savedAt.localeCompare(a.record.savedAt));
  $("historyEmpty").classList.toggle("hidden", entries.length > 0);
  const list = $("historyList");
  list.innerHTML = "";
  for (const { period, bucket, record } of entries) {
    const isOfficial = record.id === bucket.officialId;
    const fragment = $("historyItemTemplate").content.cloneNode(true);
    fragment.querySelector(".history-period").textContent =
      `${monthLabel(period)} — ${isOfficial ? "Validée Pajemploi" : "Simulation"}`;
    fragment.querySelector(".history-period").classList.add(isOfficial ? "status-official" : "status-draft");
    fragment.querySelector(".history-note").textContent =
      record.input.monthNote || `${isOfficial ? "Validée" : "Enregistrée"} le ${new Date(isOfficial ? record.validatedAt : record.savedAt).toLocaleDateString("fr-FR")}`;
    fragment.querySelector(".history-numbers").textContent =
      `${record.results.declared.days} j mensualisés • ${record.input.actualDays || 0} j réels • ` +
      `${record.results.declared.normalHours} h normales • ${money(record.results.totalToPay)} • coût famille ${money(record.results.cmg?.officialPajemploiDebit || record.results.cmg?.estimatedOutOfPocket)}`;
    fragment.querySelector(".history-edit").addEventListener("click", () => {
      showTab("monthly");
      loadMonth(period, record.id);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    const officialButton = fragment.querySelector(".history-official");
    officialButton.textContent = isOfficial ? "Validée" : "Valider Pajemploi";
    officialButton.disabled = isOfficial;
    officialButton.addEventListener("click", () => validateSimulation(period, record.id));
    fragment.querySelector(".history-delete").addEventListener("click", () => deleteSimulation(period, record.id));
    list.append(fragment);
  }
}

function validateSimulation(period, id) {
  if (!confirm(`Confirmer que cette simulation de ${monthLabel(period)} a été saisie et validée sur Pajemploi ?`)) return;
  const bucket = monthBucket(period);
  const record = bucket?.simulations?.find(item => item.id === id);
  if (!record) return;
  bucket.officialId = id;
  bucket.simulations.forEach(item => {
    item.status = item.id === id ? "official" : "simulation";
    if (item.id === id) item.validatedAt = new Date().toISOString();
  });
  saveState();
  renderHistory();
  if ($("period").value === period && currentSimulationId === id) loadMonth(period, id);
}

function deleteSimulation(period, id) {
  const bucket = monthBucket(period);
  const isOfficial = bucket?.officialId === id;
  if (!confirm(`Supprimer cette ${isOfficial ? "déclaration validée" : "simulation"} de ${monthLabel(period)} ?`)) return;
  bucket.simulations = bucket.simulations.filter(item => item.id !== id);
  if (isOfficial) bucket.officialId = null;
  if (!bucket.simulations.length) delete state.declarations[period];
  saveState();
  renderHistory();
  if ($("period").value === period && currentSimulationId === id) loadMonth(period);
}

function calculateEnding() {
  saveContract(false);
  const input = {
    endDate: $("endDate").value,
    reason: $("endReason").value,
    regularizationDueNet: $("regularizationDueNet").value,
    regularizationPaidNet: $("regularizationPaidNet").value,
    endingCpNet: $("endingCpNet").value,
    endingEquivalentWeeks: $("endingEquivalentWeeks").value,
    lastSalaryNet: $("lastSalaryNet").value
  };
  if (!input.endDate || !state.contract.startDate) return alert("Renseignez les dates de début et de fin du contrat.");
  const result = calculateEnd(state.contract, officialDeclarations(), input);
  $("endBreakdown").innerHTML = [
    `<div class="end-row"><span>Ancienneté retenue</span><strong>${result.seniorityMonths} mois</strong></div>`,
    `<div class="end-row"><span>Salaires bruts historisés (${result.recordsCount} mois)</span><strong>${money(result.grossTotal)}</strong></div>`,
    `<div class="end-row"><span>Indemnité de rupture CDI (1/80 du brut)</span><strong>${money(result.ruptureIndemnity)}</strong></div>`,
    result.cddIndemnity ? `<div class="end-row"><span>Indemnité de fin de CDD (10 %)</span><strong>${money(result.cddIndemnity)}</strong></div>` : "",
    `<div class="end-row"><span>Régularisation positive</span><strong>${money(result.regularization)}</strong></div>`,
    `<div class="end-row"><span>Indemnité compensatrice de congés</span><strong>${money(result.cpCompensation)}</strong></div>`,
    `<div class="end-row"><span>Dernier salaire et autres éléments</span><strong>${money(result.lastSalary)}</strong></div>`
  ].join("");
  $("endTotal").textContent = money(result.total);
  $("endLeaveDays").textContent = result.leaveBalance.remainingWithProjection.toLocaleString("fr-FR");
  $("endLeaveDetail").textContent =
    `${result.leaveBalance.acquiredDays.toLocaleString("fr-FR")} jours acquis dans les mois historisés. ` +
    `${result.leaveBalance.paidDays.toLocaleString("fr-FR")} jours payés sont déduits uniquement de leur période d’acquisition` +
    (result.leaveBalance.projectedAcquiredDays
      ? ` + ${result.leaveBalance.projectedAcquiredDays.toLocaleString("fr-FR")} jours projetés depuis la dernière déclaration.`
      : ".");
  const notes = [];
  if (!result.ruptureEligible && input.reason === "employer") notes.push("Pas d’indemnité de rupture calculée avant 9 mois d’ancienneté.");
  if (result.grossMissing) notes.push("Au moins un mois n’a pas de salaire brut : le 1/80 est incomplet.");
  if (number(state.contract.weeksPerYear) <= 46) notes.push("La régularisation ne peut être qu’à l’avantage de la salariée.");
  notes.push("Préavis, certificat de travail, reçu pour solde et attestation France Travail restent à traiter sur Pajemploi.");
  $("endNotes").textContent = notes.join(" ");
  $("endResults").classList.remove("hidden");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

function printEmployerDossier() {
  saveContract(false);
  const records = Object.entries(officialDeclarations()).sort(([a], [b]) => a.localeCompare(b));
  const basis = contractBasis(state.contract);
  const rows = records.map(([period, record]) => `
    <tr>
      <td>${escapeHtml(monthLabel(period))}</td>
      <td>${record.results.declared.days}</td>
      <td>${escapeHtml(record.input.actualDays || 0)}</td>
      <td>${record.results.declared.normalHours}</td>
      <td>${record.results.declared.complementaryHours}</td>
      <td>${record.results.declared.majorHours}</td>
      <td>${record.results.declared.cpDays}</td>
      <td>${money(record.results.declared.netSalary)}</td>
      <td>${money(record.results.expenses.total)}</td>
      <td>${money(record.results.totalToPay)}</td>
      <td>${money(record.results.cmg?.officialCmg || record.results.cmg?.estimatedCmg)}</td>
      <td>${money(record.results.cmg?.officialPajemploiDebit || record.results.cmg?.estimatedOutOfPocket)}</td>
    </tr>`).join("");
  const totals = records.reduce((sum, [, record]) => ({
    paid: sum.paid + number(record.results.totalToPay),
    cmg: sum.cmg + number(record.results.cmg?.officialCmg || record.results.cmg?.estimatedCmg),
    family: sum.family + number(record.results.cmg?.officialPajemploiDebit || record.results.cmg?.estimatedOutOfPocket)
  }), { paid: 0, cmg: 0, family: 0 });

  const report = window.open("", "_blank", "width=1200,height=800");
  if (!report) return alert("Autorisez l’ouverture de la fenêtre d’impression.");
  report.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8">
    <title>Dossier employeur NounouCalc</title>
    <style>
      @page{size:A4 landscape;margin:12mm}body{font:12px Arial,sans-serif;color:#172033;margin:0}
      h1{color:#3730a3;margin:0 0 4px}h2{font-size:16px;margin:22px 0 8px;border-bottom:2px solid #6366f1;padding-bottom:5px}
      .muted{color:#667085}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.box{border:1px solid #d0d5dd;border-radius:8px;padding:12px}
      table{width:100%;border-collapse:collapse;font-size:9px}th,td{border:1px solid #d0d5dd;padding:6px;text-align:right}th{background:#eef2ff}
      th:first-child,td:first-child{text-align:left}.totals{display:flex;gap:20px;justify-content:flex-end;margin-top:12px;font-size:13px}
      footer{margin-top:20px;color:#667085;font-size:9px}
    </style></head><body>
    <h1>Dossier employeur — ${escapeHtml(state.admin.childName || "Enfant gardé")}</h1>
    <p class="muted">Récapitulatif contractuel et registre des déclarations confirmées sur Pajemploi • édité le ${new Date().toLocaleDateString("fr-FR")}</p>
    <h2>Parties et contrat</h2>
    <div class="grid">
      <div class="box"><strong>Employeur</strong><br>${escapeHtml(state.admin.employerName)}<br>${escapeHtml(state.admin.employerAddress).replace(/\n/g,"<br>")}<br>N° Pajemploi : ${escapeHtml(state.admin.employerPajemploi)}</div>
      <div class="box"><strong>Assistante maternelle</strong><br>${escapeHtml(state.admin.employeeName)}<br>${escapeHtml(state.admin.employeeAddress).replace(/\n/g,"<br>")}<br>N° agrément : ${escapeHtml(state.admin.approvalNumber)}</div>
      <div class="box"><strong>Enfant</strong><br>${escapeHtml(state.admin.childName)} • né(e) le ${escapeHtml(state.admin.childBirthDate || "—")}</div>
      <div class="box"><strong>Contrat ${escapeHtml(state.contract.contractType)}</strong><br>Début : ${escapeHtml(state.contract.startDate || "—")}<br>${state.contract.weeksPerYear} semaines • ${state.contract.daysPerWeek} jours/semaine • ${state.contract.normalHoursPerWeek} h normales + ${state.contract.majorHoursPerWeek} h majorées/semaine</div>
    </div>
    <h2>Mensualisation de référence</h2>
    <p>${basis.declaredDays} jours d’activité • ${basis.declaredNormalHours} heures normales • ${basis.declaredContractMajorHours} heures majorées • taux net normal ${money(state.contract.netHourlyRate)}</p>
    <h2>Déclarations confirmées</h2>
    <table><thead><tr><th>Mois</th><th>Jours mens.</th><th>Jours réels</th><th>H normales</th><th>H compl.</th><th>H maj.</th><th>CP jours</th><th>Salaire net</th><th>Indemnités</th><th>Payé salariée</th><th>CMG estimé</th><th>Coût famille</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="12">Aucune déclaration confirmée.</td></tr>'}</tbody></table>
    <div class="totals"><strong>Total versé : ${money(totals.paid)}</strong><strong>CMG estimé : ${money(totals.cmg)}</strong><strong>Coût famille estimé : ${money(totals.family)}</strong></div>
    <footer>Ce document est un registre employeur généré à partir des validations saisies dans NounouCalc. Il ne remplace ni le bulletin de salaire ni les attestations officielles produits par l’Urssaf service Pajemploi.</footer>
    <script>window.onload=()=>window.print()<\/script></body></html>`);
  report.document.close();
}

function exportData() {
  saveContract(false);
  const backup = {
    format: "nounoucalc-complete-backup",
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    includes: [
      "administratif", "contrat", "configuration_cmg", "simulations",
      "declarations_pajemploi_validees", "conges", "montants_officiels", "preferences"
    ],
    state
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `nounoucalc-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const importedState = parsed?.format === "nounoucalc-complete-backup" ? parsed.state : parsed;
    if (![2, DATA_VERSION].includes(importedState?.version) || !importedState.contract || !importedState.declarations) {
      throw new Error("Format non reconnu");
    }
    if (!confirm("Remplacer les données locales par cette sauvegarde ?")) return;
    state = importedState.version === DATA_VERSION ? importedState : upgradeV2(importedState);
    saveState();
    applyTheme(state.preferences?.theme || "auto");
    fillContract();
    renderHistory();
    loadMonth(currentMonth());
    toast("Sauvegarde importée.");
  } catch (error) {
    alert(`Import impossible : ${error.message}`);
  } finally {
    event.target.value = "";
  }
}

async function clearColdStorage() {
  if (!("indexedDB" in globalThis)) return;
  const database = await openColdDatabase();
  const transaction = database.transaction(["state", "snapshots"], "readwrite");
  transaction.objectStore("state").clear();
  transaction.objectStore("snapshots").clear();
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function resetData() {
  if (!confirm("Effacer définitivement le contrat et tout l’historique de ce navigateur ?")) return;
  await clearColdStorage();
  state = defaultState();
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(THEME_STORAGE_KEY);
  saveState();
  applyTheme("auto");
  fillContract();
  renderHistory();
  loadMonth(currentMonth());
  toast("Données locales effacées.");
}

function showTab(name) {
  document.querySelectorAll(".tab").forEach(tab => tab.classList.toggle("active", tab.dataset.tab === name));
  document.querySelectorAll(".tab-panel").forEach(panel => panel.classList.toggle("active", panel.id === `tab-${name}`));
}

function toast(message) {
  $("notice").textContent = message;
  setTimeout(() => {
    $("notice").textContent = NOTICE_DEFAULT;
  }, 2600);
}

function preservePendingDraft() {
  const period = $("period").value;
  if (!period) return;
  sessionStorage.setItem(PENDING_DRAFT_KEY, JSON.stringify({
    period,
    input: monthlyInput(),
    simulationId: currentSimulationId,
    markAsOfficial: $("markAsOfficial").checked,
    tab: [...document.querySelectorAll(".tab")].find(item => item.classList.contains("active"))?.dataset.tab || "monthly"
  }));
}

function restorePendingDraft() {
  const raw = sessionStorage.getItem(PENDING_DRAFT_KEY);
  if (!raw) return;
  sessionStorage.removeItem(PENDING_DRAFT_KEY);
  try {
    const draft = JSON.parse(raw);
    if (!draft?.period || !draft.input) return;
    showTab(draft.tab || "monthly");
    fillCpReferenceOptions(draft.period, draft.input.cpReferenceKey);
    monthlyIds.forEach(id => setValue(id, draft.input[id]));
    setValue("markAsOfficial", draft.markAsOfficial);
    currentSimulationId = draft.simulationId || null;
    currentRecord = currentSimulationId
      ? monthBucket(draft.period)?.simulations?.find(item => item.id === currentSimulationId) || null
      : null;
    $("monthStatus").textContent = "Brouillon restauré après mise à jour";
    $("results").classList.add("hidden");
    updatePeriodHints();
    toast("Mise à jour installée sans perdre le brouillon en cours.");
  } catch (error) {
    console.warn("Brouillon de mise à jour illisible", error);
  }
}

async function fetchBuildId() {
  const response = await fetch(`build.json?ts=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`build.json ${response.status}`);
  return (await response.json()).build;
}

async function registerPwa() {
  if (!("serviceWorker" in navigator) || !globalThis.isSecureContext) return;
  try {
    const hadController = Boolean(navigator.serviceWorker.controller);
    const registration = await navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" });
    let reloading = false;
    const reloadWithDraft = () => {
      if (reloading) return;
      reloading = true;
      preservePendingDraft();
      location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hadController) reloadWithDraft();
    });
    const checkForUpdate = async () => {
      try {
        const build = await fetchBuildId();
        const previous = localStorage.getItem(BUILD_STORAGE_KEY);
        localStorage.setItem(BUILD_STORAGE_KEY, build);
        if (previous && previous !== build) {
          preservePendingDraft();
          await registration.update();
          reloadWithDraft();
        }
      } catch (error) {
        console.debug("Vérification de mise à jour différée", error);
      }
    };
    await checkForUpdate();
    setInterval(checkForUpdate, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void checkForUpdate();
    });
  } catch (error) {
    console.warn("Installation PWA indisponible", error);
  }
}

async function initialize() {
  fillContract();
  renderHistory();
  loadMonth(currentMonth());
  applyTheme(state.preferences?.theme || localStorage.getItem(THEME_STORAGE_KEY) || "auto");
  await hydrateFromColdStorage();
  restorePendingDraft();
  void registerPwa();
}

document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => showTab(tab.dataset.tab)));
contractIds.forEach(id => $(id).addEventListener("input", updateContractPreview));
$("period").addEventListener("change", event => loadMonth(event.target.value));
$("newSimulationButton").addEventListener("click", newSimulation);
$("saveContractButton").addEventListener("click", () => saveContract(true));
$("calculateButton").addEventListener("click", calculateAndSave);
$("calculateEndButton").addEventListener("click", calculateEnding);
$("printMonthly").addEventListener("click", () => window.print());
$("printDossierButton").addEventListener("click", printEmployerDossier);
$("exportButton").addEventListener("click", exportData);
$("importFile").addEventListener("change", importData);
$("resetButton").addEventListener("click", resetData);
$("themeToggle").addEventListener("click", cycleTheme);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if ((state.preferences?.theme || "auto") === "auto") applyTheme("auto");
});

void initialize();

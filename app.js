import {
  DATA_VERSION,
  calculateCmg,
  calculateDeclaration,
  calculateEnd,
  contractBasis,
  defaultState,
  estimatedGrossHourlyRate,
  leaveSummary,
  money,
  monthLabel,
  number,
  referencePeriod,
  round,
  scheduledDaysInMonth
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
  "startDate", "contractType", "contractNumber", "lastJobTitle", "weeksPerYear", "daysPerWeek", "normalHoursPerWeek",
  "majorHoursPerWeek", "netHourlyRate", "grossHourlyRate", "majorMarkup",
  "complementaryMarkup", "maintenanceRate", "mealRate", "partialMealRate", "employeeDependentChildrenUnder15",
  "cpPaymentMode", "cpPaymentMonth"
];
const adminIds = [
  "employerName", "employerPajemploi", "employerAddress", "employerPhone", "employerBirthDate",
  "secondaryEmployerName", "secondaryEmployerAddress", "secondaryEmployerPhone", "secondaryEmployerBirthDate",
  "employeeName", "employeeNumber", "employeeAddress", "employeeBirthDate", "employeeBirthPlace",
  "employeeBirthDepartment", "employeeNationality", "employeeRetirementFund",
  "approvalNumber", "childName", "childBirthDate"
];
const cmgIds = ["annualResourcesN2", "dependentChildren", "aeeh"];
const monthlyFields = {
  period: "period",
  paymentDate: "paymentDate",
  actualDays: "actualDays",
  meals: "meals",
  actualCareHours: "actualCareHours",
  partialMeals: "partialMeals",
  complementaryHours: "complementaryHours",
  extraMajorHours: "extraMajorHours",
  absenceDeductionNet: "absenceDeductionNet",
  otherSalaryNet: "otherSalaryNet",
  leaveAdjustmentWeeks: "leaveAdjustmentWeeks",
  cpDaysDeclared: "cpDaysDeclared",
  cpPaidNet: "cpPaidNet",
  cpReferenceKey: "cpReferenceKey",
  kilometerAllowance: "kilometerAllowance",
  advancePaid: "advancePaid",
  specificHours: "specificHours",
  over24Hours: "over24Hours",
  disabilityCare: "disabilityCare",
  franceTravailPaidHours: "franceTravailPaidHours",
  unpaidHours: "unpaidHours",
  unpaidDays: "unpaidDays",
  absenceType: "absenceType",
  absenceStartDate: "absenceStartDate",
  absenceEndDate: "absenceEndDate",
  bonusType: "bonusType",
  bonusGross: "bonusGross",
  bonusPaymentDate: "bonusPaymentDate",
  isEndContract: "isEndContract",
  endDate: "endDateMonthly",
  endReason: "endReasonMonthly",
  terminationNotificationDate: "terminationNotificationDate",
  noticeStatus: "noticeStatus",
  noticeStartDate: "noticeStartDate",
  noticeEndDate: "noticeEndDate",
  precariousnessNet: "precariousnessNet",
  endingCpNet: "endingCpNetMonthly",
  endingCpDays: "endingCpDays",
  noticeCompensationNet: "noticeCompensationNet",
  ruptureIndemnityNet: "ruptureIndemnityNet",
  endingRegularizationNet: "endingRegularizationNet",
  endingCpGross: "endingCpGross",
  precariousnessGross: "precariousnessGross",
  legalRuptureAmount: "legalRuptureAmount",
  otherTerminationGross: "otherTerminationGross",
  officialGross: "officialGross",
  officialCmg: "officialCmg",
  officialPajemploiDebit: "officialPajemploiDebit",
  monthNote: "monthNote"
};

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

function setMonthlyValues(input) {
  for (const [key, id] of Object.entries(monthlyFields)) setValue(id, input?.[key]);
}

function monthlyInput() {
  return {
    ...Object.fromEntries(Object.entries(monthlyFields).map(([key, id]) => [
      key,
      $(id).type === "checkbox" ? $(id).checked : $(id).value
    ])),
    autoLeaveAccrual: true
  };
}

function fillContract() {
  contractIds.forEach(id => setValue(id, state.contract[id]));
  adminIds.forEach(id => setValue(id, state.admin[id]));
  cmgIds.forEach(id => setValue(id, state.cmgProfile[id]));
  refreshEstimatedGrossRate();
  updateContractPreview();
}

function saveContract(showMessage = true) {
  refreshEstimatedGrossRate();
  state.contract = { ...state.contract, ...readValues(contractIds) };
  state.admin = { ...state.admin, ...readValues(adminIds) };
  state.cmgProfile = { ...state.cmgProfile, ...readValues(cmgIds) };
  saveState();
  updateContractPreview();
  updatePeriodHints();
  if (showMessage) toast("Contrat enregistré.");
}

function defaultMonthly(period) {
  const ref = referencePeriod(period);
  const selectedMonth = number(period.split("-")[1]);
  const paymentMonth = number(state.contract.cpPaymentMonth, 6);
  const paidReferenceKey = state.contract.cpPaymentMode === "june" && selectedMonth === paymentMonth
    ? String(number(ref.key) - 1)
    : ref.key;
  const proposedDays = scheduledDaysInMonth(state.contract, period);
  const weeklyHours = number(state.contract.normalHoursPerWeek) + number(state.contract.majorHoursPerWeek);
  const proposedHours = number(state.contract.daysPerWeek) > 0
    ? proposedDays * weeklyHours / number(state.contract.daysPerWeek)
    : 0;
  return {
    period,
    paymentDate: lastDay(period),
    actualDays: proposedDays,
    meals: proposedDays,
    actualCareHours: round(proposedHours, 2),
    partialMeals: 0,
    autoLeaveAccrual: true,
    leaveAdjustmentWeeks: 0,
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
    franceTravailPaidHours: "",
    unpaidHours: 0,
    unpaidDays: 0,
    absenceType: "",
    absenceStartDate: "",
    absenceEndDate: "",
    bonusType: "",
    bonusGross: 0,
    bonusPaymentDate: "",
    isEndContract: "no",
    endDate: lastDay(period),
    endReason: state.contract.contractType === "CDD" ? "cdd" : "employer",
    terminationNotificationDate: "",
    noticeStatus: "performed",
    noticeStartDate: "",
    noticeEndDate: lastDay(period),
    precariousnessNet: "",
    endingCpNet: "",
    endingCpDays: "",
    noticeCompensationNet: 0,
    ruptureIndemnityNet: "",
    endingRegularizationNet: 0,
    endingCpGross: "",
    precariousnessGross: "",
    legalRuptureAmount: "",
    otherTerminationGross: 0,
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
  setMonthlyValues({ ...defaultMonthly(period), ...input });
  const simulationCount = bucket?.simulations?.length || 0;
  $("monthStatus").textContent = existing && existing.id === bucket?.officialId
    ? "Validée sur Pajemploi"
    : simulationCount ? `${simulationCount} simulation${simulationCount > 1 ? "s" : ""}` : "Nouveau mois";
  currentRecord = existing || null;
  currentSimulationId = existing?.id || null;
  updateMonthlyEndVisibility(false);
  updatePeriodHints();
  updateAutomaticLeaveInfo();
  if (existing) renderResults(existing);
  else $("results").classList.add("hidden");
}

function newSimulation() {
  const period = $("period").value || currentMonth();
  const source = monthlyInput();
  const input = source.period === period ? {
    ...source,
    officialGross: "",
    officialCmg: "",
    officialPajemploiDebit: "",
    monthNote: source.monthNote ? `${source.monthNote} — variante` : ""
  } : defaultMonthly(period);
  fillCpReferenceOptions(period, input.cpReferenceKey);
  setMonthlyValues(input);
  currentRecord = null;
  currentSimulationId = null;
  $("monthStatus").textContent = "Variante non enregistrée";
  $("results").classList.add("hidden");
  updateMonthlyEndVisibility(false);
  updateAutomaticLeaveInfo();
  toast("Variante dupliquée. Modifiez seulement les valeurs à comparer.");
}

function buildDraftRecord(input = monthlyInput()) {
  const results = calculateDeclaration(state.contract, input);
  return { period: input.period, input, results };
}

function updateAutomaticLeaveInfo() {
  const input = monthlyInput();
  if (!input.period || !state.contract.startDate) {
    $("automaticLeaveInfo").textContent = "Renseignez la date de début du contrat pour activer le calcul automatique des congés.";
    return;
  }
  const untilDate = input.isEndContract === "yes" && input.endDate ? input.endDate : lastDay(input.period);
  const summary = leaveSummary(state.contract, officialDeclarations(), input.period, buildDraftRecord(input), untilDate);
  $("automaticLeaveInfo").innerHTML =
    `<strong>Congés automatiques :</strong> ${summary.monthAcquiredRaw.toLocaleString("fr-FR")} jour ce mois ` +
    `(${summary.monthEquivalentWeeks.toLocaleString("fr-FR")} semaines équivalentes). ` +
    `Depuis le ${new Date(`${state.contract.startDate}T12:00:00`).toLocaleDateString("fr-FR")} : ` +
    `<strong>${summary.ledger.acquiredDays.toLocaleString("fr-FR")} acquis</strong>, ` +
    `${summary.ledger.paidDays.toLocaleString("fr-FR")} payés, ` +
    `<strong>${summary.ledger.remainingDays.toLocaleString("fr-FR")} restant à rémunérer</strong>.`;
}

function updateMonthlyEndVisibility(recalculate = true) {
  const active = $("isEndContract").value === "yes";
  $("monthlyEndFields").classList.toggle("hidden", !active);
  if (active) {
    $("monthlyEndCard").open = true;
    if (!$("endDateMonthly").value) $("endDateMonthly").value = lastDay($("period").value);
    if (recalculate) calculateMonthlyEndSuggestions();
  }
  updateAutomaticLeaveInfo();
}

function calculateMonthlyEndSuggestions() {
  if ($("isEndContract").value !== "yes") return;
  saveContract(false);
  const input = monthlyInput();
  if (!input.endDate) input.endDate = lastDay(input.period);
  const draft = buildDraftRecord({
    ...input,
    precariousnessNet: "",
    endingCpNet: "",
    endingCpDays: "",
    ruptureIndemnityNet: "",
    noticeCompensationNet: 0,
    endingRegularizationNet: 0
  });
  const declarations = { ...officialDeclarations(), [input.period]: draft };
  const result = calculateEnd(state.contract, declarations, {
    endDate: input.endDate,
    reason: input.endReason,
    regularizationDueNet: "",
    regularizationPaidNet: "",
    endingCpNet: "",
    lastSalaryNet: "",
    ruptureIndemnityNet: "",
    precariousnessNet: ""
  });
  setValue("precariousnessNet", result.suggestedCddIndemnity);
  setValue("endingCpNetMonthly", result.suggestedCpCompensation);
  setValue("endingCpDays", result.leaveBalance.remainingDays);
  setValue("ruptureIndemnityNet", result.suggestedRuptureIndemnity);
  setValue("endingRegularizationNet", result.regularization);
  setValue("endingCpGross", result.suggestedCpCompensationGross);
  setValue("precariousnessGross", result.suggestedCddIndemnityGross);
  if (!$("legalRuptureAmount").value) setValue("legalRuptureAmount", result.suggestedRuptureIndemnity);
  $("endAutoInfo").innerHTML =
    `<strong>Proposition automatique :</strong> ${result.leaveBalance.remainingDays.toLocaleString("fr-FR")} jours de congés à solder, ` +
    `${money(result.suggestedCpCompensation)} de congés ` +
    `(maintien ${money(result.suggestedCpMaintenanceNet)} / dixième ${money(result.suggestedCpTenthNet)}), ` +
    `${money(result.suggestedRuptureIndemnity)} d’indemnité de rupture` +
    (result.estimatedMonthsCount ? ` • ${result.estimatedMonthsCount} mois antérieurs estimés faute de déclaration confirmée.` : ".");
  updateAutomaticLeaveInfo();
}

function fillCpReferenceOptions(period, selectedKey = "") {
  const currentKey = number(referencePeriod(period).key);
  $("cpReferenceKey").innerHTML = [currentKey - 1, currentKey].map(key =>
    `<option value="${key}">1er juin ${key} – 31 mai ${key + 1}</option>`
  ).join("");
  $("cpReferenceKey").value = selectedKey || String(currentKey);
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
  const isOfficial = bucket.officialId === id;
  const record = {
    id,
    input,
    results,
    status: isOfficial ? "official" : "simulation",
    savedAt: new Date().toISOString(),
    validatedAt: isOfficial ? currentRecord?.validatedAt || new Date().toISOString() : currentRecord?.validatedAt || null
  };
  const index = bucket.simulations.findIndex(item => item.id === id);
  if (index >= 0) bucket.simulations[index] = record;
  else bucket.simulations.push(record);
  if (isOfficial) bucket.officialId = id;
  currentRecord = record;
  currentSimulationId = id;
  saveState();
  renderResults(record);
  renderHistory();
  $("monthStatus").textContent = isOfficial ? "Confirmée sur Pajemploi" : "Simulation enregistrée";
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
    salary.endingCpNet ? row("Indemnité compensatrice de congés", salary.endingCpNet) : "",
    salary.noticeCompensationNet ? row("Indemnité compensatrice de préavis", salary.noticeCompensationNet) : "",
    salary.precariousnessNet ? row("Prime de précarité", salary.precariousnessNet) : "",
    salary.regularizationNet ? row("Régularisation de salaire", salary.regularizationNet) : "",
    salary.otherSalaryNet ? row("Autre élément de salaire", salary.otherSalaryNet) : "",
    salary.absenceDeductionNet ? row("Déduction d’absence", -salary.absenceDeductionNet) : "",
    row("Salaire net à déclarer", salary.netSalary)
  ].join("");

  const answer = value => value ? "Oui" : "Non";
  $("additionalAnswers").innerHTML = [
    `<div class="breakdown-row"><span>Heures spécifiques</span><strong>${answer(results.additional.specificHours)}</strong></div>`,
    `<div class="breakdown-row"><span>Garde de plus de 24 h consécutives</span><strong>${answer(results.additional.over24Hours)}</strong></div>`,
    `<div class="breakdown-row"><span>Handicap, longue maladie ou inadaptation</span><strong>${answer(results.additional.disabilityCare)}</strong></div>`,
    `<div class="breakdown-row"><span>Fin de contrat</span><strong>${answer(results.additional.endContract)}</strong></div>`
  ].join("");

  $("outEndBreakdownCard").classList.toggle("hidden", !results.ending?.active);
  if (results.ending?.active) {
    $("outEndBreakdown").innerHTML = [
      `<div class="breakdown-row"><span>Date de fin</span><strong>${new Date(`${results.ending.endDate}T12:00:00`).toLocaleDateString("fr-FR")}</strong></div>`,
      row("Prime de précarité", results.ending.precariousnessNet),
      row("Indemnité compensatrice de congés", results.ending.cpCompensationNet, `${results.ending.cpDays} jours soldés`),
      row("Indemnité compensatrice de préavis", results.ending.noticeCompensationNet),
      row("Indemnité de rupture", results.ending.ruptureIndemnityNet),
      row("Régularisation de salaire", results.ending.regularizationNet),
      row("Total des éléments de fin", results.ending.total)
    ].join("");
  }

  const confirmed = officialDeclarations();
  const draft = currentRecord?.id === monthBucket(input.period)?.officialId
    ? null
    : { period: input.period, input, results };
  const untilDate = input.isEndContract === "yes" && input.endDate ? input.endDate : lastDay(input.period);
  const summary = leaveSummary(state.contract, confirmed, input.period, draft, untilDate);
  $("outReferencePeriod").textContent = summary.reference.label;
  $("outCpAcquired").textContent = summary.acquiredRaw.toLocaleString("fr-FR");
  $("outCpPaid").textContent = summary.paidDays.toLocaleString("fr-FR");
  $("outCpMonthAcquired").textContent = summary.monthAcquiredRaw.toLocaleString("fr-FR");
  $("outCpGlobalAcquired").textContent = summary.ledger.acquiredDays.toLocaleString("fr-FR");
  $("outCpGlobalPaid").textContent = summary.ledger.paidDays.toLocaleString("fr-FR");
  $("outCpGlobalRemaining").textContent = summary.ledger.remainingDays.toLocaleString("fr-FR");
  $("cpProgress").style.width = `${Math.min(100, summary.acquiredRaw / 30 * 100)}%`;
  renderOfficialConfirmation(record);
  $("results").classList.remove("hidden");
}

function renderOfficialConfirmation(record) {
  const bucket = monthBucket(record.input.period);
  const official = bucket?.officialId === record.id;
  $("officialConfirmation").classList.toggle("is-official", official);
  $("officialConfirmationTitle").textContent = official
    ? "Déclaration confirmée comme réellement saisie sur Pajemploi"
    : "Cette version est encore une simulation";
  $("officialConfirmationText").textContent = official
    ? `Confirmée le ${new Date(record.validatedAt || record.savedAt).toLocaleDateString("fr-FR")}. Elle alimente l’historique officiel, les congés et la fin de contrat.`
    : "Enregistrez et comparez librement plusieurs variantes. Seule la version confirmée alimentera les calculs futurs.";
  $("confirmOfficialButton").textContent = official ? "Déclaration confirmée" : "Confirmer la saisie sur Pajemploi";
  $("confirmOfficialButton").disabled = official;
}

function refreshEstimatedGrossRate() {
  const field = $("grossHourlyRate");
  const net = number($("netHourlyRate").value);
  field.value = net ? estimatedGrossHourlyRate(net) : "";
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

function updateActualActivityDefaults() {
  const days = Math.max(0, number($("actualDays").value));
  const weeklyHours = number(state.contract.normalHoursPerWeek) + number(state.contract.majorHoursPerWeek);
  const hours = number(state.contract.daysPerWeek) > 0
    ? days * weeklyHours / number(state.contract.daysPerWeek)
    : 0;
  setValue("actualCareHours", round(hours, 2));
  if (!$("meals").value) setValue("meals", days);
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
      `${record.results.declared.normalHours} h normales • ${money(record.results.totalToPay)}` +
      (number(record.input.unpaidDays) || number(record.input.unpaidHours)
        ? ` • non payé ${number(record.input.unpaidDays)} j / ${number(record.input.unpaidHours)} h`
        : "") +
      (number(record.input.bonusGross) ? ` • prime brute ${money(record.input.bonusGross)}` : "") +
      (record.results.ending?.active ? ` • fin de contrat ${new Date(`${record.results.ending.endDate}T12:00:00`).toLocaleDateString("fr-FR")}` : "") +
      ` • coût famille ${money(record.results.cmg?.officialPajemploiDebit || record.results.cmg?.estimatedOutOfPocket)}`;
    fragment.querySelector(".history-edit").addEventListener("click", () => {
      showTab("monthly");
      loadMonth(period, record.id);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    const officialButton = fragment.querySelector(".history-official");
    officialButton.textContent = isOfficial ? "Confirmée" : "Confirmer Pajemploi";
    officialButton.disabled = isOfficial;
    officialButton.addEventListener("click", () => validateSimulation(period, record.id));
    fragment.querySelector(".history-delete").addEventListener("click", () => deleteSimulation(period, record.id));
    list.append(fragment);
  }
}

function validateSimulation(period, id) {
  if (!confirm(`Confirmer que cette version de ${monthLabel(period)} est exactement celle saisie et validée sur Pajemploi ? Elle deviendra la référence pour les congés et la fin de contrat.`)) return;
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
  toast("Déclaration Pajemploi confirmée. Elle alimente désormais l’historique officiel.");
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
    regularizationDueNet: "",
    regularizationPaidNet: "",
    endingCpNet: "",
    lastSalaryNet: ""
  };
  if (!input.endDate || !state.contract.startDate) return alert("Renseignez les dates de début et de fin du contrat.");
  const declarations = { ...officialDeclarations() };
  const endingPeriod = input.endDate.slice(0, 7);
  let endingMonthEstimated = false;
  if (!declarations[endingPeriod]) {
    const endingDays = scheduledDaysInMonth(state.contract, endingPeriod, input.endDate);
    const weeklyHours = number(state.contract.normalHoursPerWeek) + number(state.contract.majorHoursPerWeek);
    const endingDraftInput = {
      ...defaultMonthly(endingPeriod),
      actualDays: endingDays,
      actualCareHours: number(state.contract.daysPerWeek) > 0
        ? round(endingDays * weeklyHours / number(state.contract.daysPerWeek), 2)
        : 0,
      meals: endingDays,
      endDate: input.endDate,
      monthNote: "Dernier mois estimé automatiquement pour la simulation de fin de contrat"
    };
    declarations[endingPeriod] = buildDraftRecord(endingDraftInput);
    endingMonthEstimated = true;
  }
  const result = calculateEnd(state.contract, declarations, input);
  $("endBreakdown").innerHTML = [
    `<div class="end-row"><span>Ancienneté retenue</span><strong>${result.seniorityMonths} mois</strong></div>`,
    `<div class="end-row"><span>Salaires bruts historisés (${result.recordsCount} mois)</span><strong>${money(result.grossTotal)}</strong></div>`,
    `<div class="end-row"><span>Indemnité de rupture CDI (1/80 du brut)</span><strong>${money(result.ruptureIndemnity)}</strong></div>`,
    result.cddIndemnity ? `<div class="end-row"><span>Indemnité de fin de CDD (10 %)</span><strong>${money(result.cddIndemnity)}</strong></div>` : "",
    `<div class="end-row"><span>Régularisation positive automatique<small>${money(result.regularizationDue)} dû au réel − ${money(result.regularizationPaid)} mensualisé</small></span><strong>${money(result.regularization)}</strong></div>`,
    `<div class="end-row"><span>Indemnité compensatrice de congés<small>Plus favorable : maintien ${money(result.suggestedCpMaintenanceNet)} / dixième ${money(result.suggestedCpTenthNet)}</small></span><strong>${money(result.cpCompensation)}</strong></div>`,
    `<div class="end-row"><span>Dernier salaire et indemnités d’accueil</span><strong>${money(result.lastSalary)}</strong></div>`
  ].join("");
  $("endTotal").textContent = money(result.total);
  $("endLeaveDays").textContent = result.leaveBalance.remainingWithProjection.toLocaleString("fr-FR");
  $("endLeaveDetail").textContent =
    `${result.leaveBalance.acquiredDays.toLocaleString("fr-FR")} jours acquis automatiquement depuis le début du contrat. ` +
    `${result.leaveBalance.paidDays.toLocaleString("fr-FR")} jours déjà payés sont déduits de leur période d’acquisition.`;
  const notes = [];
  if (!result.ruptureEligible && input.reason === "employer") notes.push("Pas d’indemnité de rupture calculée avant 9 mois d’ancienneté.");
  if (result.grossMissing) notes.push("Le brut de certains mois est estimé depuis le net ; recopiez ensuite le brut des bulletins Pajemploi pour figer le 1/80 officiel.");
  if (result.estimatedMonthsCount) notes.push(`${result.estimatedMonthsCount} mois sans déclaration confirmée ont été estimés avec la mensualisation contractuelle.`);
  if (endingMonthEstimated) notes.push("Le dernier mois n’est pas encore confirmé : il est inclus automatiquement avec les jours programmés jusqu’à la date de fin. Corrigez les présences dans l’onglet Mois avant la déclaration définitive.");
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
  const dateFr = value => value
    ? new Date(`${value}T12:00:00`).toLocaleDateString("fr-FR")
    : "—";
  const text = value => escapeHtml(value || "—");
  const endReasonLabels = {
    employer: "Retrait de l’enfant",
    employee: "Démission",
    death: "Décès de l’enfant",
    childDeath: "Décès de l’enfant",
    serious: "Faute grave ou lourde",
    seriousMisconduct: "Faute grave ou lourde",
    approval: "Retrait ou suspension d’agrément",
    cdd: "Fin de CDD",
    agreement: "Autre motif",
    other: "Autre motif"
  };
  const noticeLabels = {
    performed: "Effectué et payé",
    partial: "Partiellement effectué",
    not_performed_paid: "Non effectué mais payé",
    not_performed_unpaid: "Non effectué et non payé à la demande de la salariée",
    not_applicable: "Pas de préavis applicable"
  };
  const nationalityLabels = {
    france: "Française",
    ue: "Union européenne",
    eee: "EEE hors UE",
    hors_ue_eee: "Hors UE / EEE"
  };
  const absenceLabels = {
    maladie: "Arrêt maladie",
    maternite: "Congé maternité",
    paternite: "Congé paternité / accueil de l’enfant",
    adoption: "Congé d’adoption",
    accident_travail: "Accident du travail",
    accident_trajet: "Accident de trajet",
    activite_partielle: "Activité partielle",
    conge_sans_solde: "Congé sans solde / convenance personnelle",
    conge_parental: "Congé parental",
    autre: "Autre événement"
  };
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
  const franceTravailRows = records.map(([period, record]) => {
    const calculatedHours = number(record.results.declared.normalHours) +
      number(record.results.declared.complementaryHours) +
      number(record.results.declared.majorHours);
    const hours = number(record.input.franceTravailPaidHours) || calculatedHours;
    const officialGross = number(record.input.officialGross);
    const gross = officialGross || number(record.results.salary.grossForHistory);
    const unpaid = [
      number(record.input.unpaidDays) ? `${number(record.input.unpaidDays).toLocaleString("fr-FR")} j` : "",
      number(record.input.unpaidHours) ? `${number(record.input.unpaidHours).toLocaleString("fr-FR")} h` : ""
    ].filter(Boolean).join(" / ") || "0";
    return `<tr>
      <td>${escapeHtml(monthLabel(period))}</td>
      <td>${dateFr(record.input.paymentDate)}</td>
      <td>${hours.toLocaleString("fr-FR")} h</td>
      <td>${unpaid}</td>
      <td>${money(gross)}${officialGross ? "" : " <em>(estimé)</em>"}</td>
      <td>${number(record.input.bonusGross) ? `${money(record.input.bonusGross)}<br>${text(record.input.bonusType)}` : "—"}</td>
      <td>${text(record.input.monthNote)}</td>
    </tr>`;
  }).join("");
  const absenceRows = records
    .filter(([, record]) => record.input.absenceType || number(record.input.unpaidDays) || number(record.input.unpaidHours))
    .map(([period, record]) => `<tr>
      <td>${escapeHtml(monthLabel(period))}</td>
      <td>${text(absenceLabels[record.input.absenceType] || record.input.absenceType)}</td>
      <td>${dateFr(record.input.absenceStartDate)}</td>
      <td>${dateFr(record.input.absenceEndDate)}</td>
      <td>${number(record.input.unpaidDays).toLocaleString("fr-FR")} j / ${number(record.input.unpaidHours).toLocaleString("fr-FR")} h</td>
    </tr>`).join("");
  const endRows = records
    .filter(([, record]) => record.results.ending?.active)
    .map(([period, record]) => {
      const ending = record.results.ending;
      return `<tr>
        <td>${escapeHtml(monthLabel(period))}</td>
        <td>${escapeHtml(new Date(`${ending.endDate}T12:00:00`).toLocaleDateString("fr-FR"))}</td>
        <td>${escapeHtml(endReasonLabels[ending.reason] || ending.reason || "—")}</td>
        <td>${record.input.endingCpGross ? money(record.input.endingCpGross) : "À compléter"}</td>
        <td>${record.input.precariousnessGross ? money(record.input.precariousnessGross) : "—"}</td>
        <td>${record.input.legalRuptureAmount ? money(record.input.legalRuptureAmount) : "À compléter"}</td>
        <td>${money(record.input.otherTerminationGross)}</td>
        <td>${ending.cpDays.toLocaleString("fr-FR")} j • ${money(ending.cpCompensationNet)}</td>
        <td>${money(ending.ruptureIndemnityNet)}</td>
        <td>${money(ending.total)}</td>
      </tr>`;
    }).join("");
  const ruptureSalaryRows = records
    .filter(([, record]) => record.results.ending?.active)
    .map(([period, record]) => {
      const calculatedHours = number(record.results.declared.normalHours) +
        number(record.results.declared.complementaryHours) +
        number(record.results.declared.majorHours);
      const hours = number(record.input.franceTravailPaidHours) || calculatedHours;
      const gross = number(record.input.officialGross) || number(record.results.salary.grossForHistory);
      const unpaid = `${number(record.input.unpaidDays).toLocaleString("fr-FR")} j / ${number(record.input.unpaidHours).toLocaleString("fr-FR")} h`;
      return `<tr>
        <td>${escapeHtml(monthLabel(period))}</td>
        <td>${dateFr(record.input.paymentDate)}</td>
        <td>${hours.toLocaleString("fr-FR")} h</td>
        <td>${unpaid}</td>
        <td>${money(gross)}${number(record.input.officialGross) ? "" : " <em>(estimé)</em>"}</td>
      </tr>`;
    }).join("");
  const finalEntry = [...records].reverse().find(([, record]) => record.results.ending?.active);
  const finalRecord = finalEntry?.[1];
  const finalEnding = finalRecord?.results.ending;
  const missingFranceData = [
    !state.admin.employerPhone && "téléphone employeur",
    !state.admin.employerBirthDate && "date de naissance employeur",
    !state.admin.employeeBirthDate && "date de naissance salariée",
    !state.admin.employeeNumber && "numéro de Sécurité sociale",
    records.some(([, record]) => !number(record.input.officialGross)) && "salaires bruts officiels de certains mois",
    finalRecord && !number(finalRecord.input.endingCpGross) && "indemnité compensatrice de congés payés brute"
  ].filter(Boolean);
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
      .alert{margin:12px 0;padding:10px;border:1px solid #f59e0b;background:#fffbeb;color:#92400e}.page-break{break-before:page}
      .ft-title{color:#075985;border-color:#0ea5e9}.label{color:#667085;font-size:10px;text-transform:uppercase;letter-spacing:.04em}
      footer{margin-top:20px;color:#667085;font-size:9px}
    </style></head><body>
    <h1>Dossier employeur — ${escapeHtml(state.admin.childName || "Enfant gardé")}</h1>
    <p class="muted">Récapitulatif contractuel et registre des déclarations confirmées sur Pajemploi • édité le ${new Date().toLocaleDateString("fr-FR")}</p>
    <h2>Parties et contrat</h2>
    <div class="grid">
      <div class="box"><strong>Employeur principal</strong><br>${text(state.admin.employerName)}<br>${text(state.admin.employerAddress).replace(/\n/g,"<br>")}<br>Tél. : ${text(state.admin.employerPhone)} • né(e) le ${dateFr(state.admin.employerBirthDate)}<br>N° Pajemploi : ${text(state.admin.employerPajemploi)}</div>
      <div class="box"><strong>Second employeur</strong><br>${text(state.admin.secondaryEmployerName)}<br>${text(state.admin.secondaryEmployerAddress).replace(/\n/g,"<br>")}<br>Tél. : ${text(state.admin.secondaryEmployerPhone)} • né(e) le ${dateFr(state.admin.secondaryEmployerBirthDate)}</div>
      <div class="box"><strong>Assistante maternelle</strong><br>${text(state.admin.employeeName)}<br>${text(state.admin.employeeAddress).replace(/\n/g,"<br>")}<br>Née le ${dateFr(state.admin.employeeBirthDate)} à ${text(state.admin.employeeBirthPlace)} (${text(state.admin.employeeBirthDepartment)})<br>NIR : ${text(state.admin.employeeNumber)} • nationalité : ${text(nationalityLabels[state.admin.employeeNationality])}<br>Retraite : ${text(state.admin.employeeRetirementFund)} • agrément : ${text(state.admin.approvalNumber)}</div>
      <div class="box"><strong>Enfant et contrat</strong><br>${text(state.admin.childName)} • né(e) le ${dateFr(state.admin.childBirthDate)}<br>${text(state.contract.contractType)} n° ${text(state.contract.contractNumber || "00000")} • début ${dateFr(state.contract.startDate)}<br>${text(state.contract.lastJobTitle)}<br>${state.contract.weeksPerYear} semaines • ${state.contract.daysPerWeek} jours/semaine • ${state.contract.normalHoursPerWeek} h normales + ${state.contract.majorHoursPerWeek} h majorées/semaine</div>
    </div>
    <h2>Mensualisation de référence</h2>
    <p>${basis.declaredDays} jours d’activité • ${basis.declaredNormalHours} heures normales • ${basis.declaredContractMajorHours} heures majorées • taux net normal ${money(state.contract.netHourlyRate)}</p>
    <h2>Déclarations confirmées</h2>
    <table><thead><tr><th>Mois</th><th>Jours mens.</th><th>Jours réels</th><th>H normales</th><th>H compl.</th><th>H maj.</th><th>CP jours</th><th>Salaire net</th><th>Indemnités</th><th>Payé salariée</th><th>CMG estimé</th><th>Coût famille</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="12">Aucune déclaration confirmée.</td></tr>'}</tbody></table>
    <div class="totals"><strong>Total versé : ${money(totals.paid)}</strong><strong>CMG estimé : ${money(totals.cmg)}</strong><strong>Coût famille estimé : ${money(totals.family)}</strong></div>

    <h2 class="ft-title page-break">Aide à la saisie de l’attestation France Travail</h2>
    <p class="muted">Mémo préparatoire constitué uniquement à partir des déclarations confirmées. L’attestation officielle doit être générée et transmise depuis Pajemploi, puis remise à la salariée.</p>
    ${missingFranceData.length ? `<div class="alert"><strong>Informations à compléter avant la saisie :</strong> ${missingFranceData.map(text).join(", ")}.</div>` : ""}
    <div class="grid">
      <div class="box"><span class="label">Emploi</span><br><strong>${text(state.contract.lastJobTitle)}</strong><br>Période : du ${dateFr(state.contract.startDate)} au ${dateFr(finalEnding?.endDate)}<br>N° contrat : ${text(state.contract.contractNumber || "00000")}<br>Horaire hebdomadaire : ${(number(state.contract.normalHoursPerWeek) + number(state.contract.majorHoursPerWeek)).toLocaleString("fr-FR")} h</div>
      <div class="box"><span class="label">Rupture et préavis</span><br>Motif : <strong>${text(endReasonLabels[finalEnding?.reason])}</strong><br>Notification : ${dateFr(finalRecord?.input.terminationNotificationDate)}<br>Préavis : ${text(noticeLabels[finalRecord?.input.noticeStatus])}<br>Du ${dateFr(finalRecord?.input.noticeStartDate)} au ${dateFr(finalRecord?.input.noticeEndDate)}</div>
    </div>
    <h2 class="ft-title">Salaires des mois civils complets</h2>
    <p class="muted">France Travail demande les 25 derniers mois, ou 37 mois selon l’âge à la rupture. Les montants marqués « estimé » doivent être remplacés par le brut du bulletin Pajemploi.</p>
    <table><thead><tr><th>Période de paie</th><th>Date de paiement</th><th>Temps travaillé/payé</th><th>Temps non payé</th><th>Salaire brut</th><th>Prime brute</th><th>Observations</th></tr></thead>
    <tbody>${franceTravailRows || '<tr><td colspan="7">Aucune déclaration Pajemploi confirmée.</td></tr>'}</tbody></table>
    <h2 class="ft-title">Arrêts, absences et suspensions</h2>
    <table><thead><tr><th>Mois</th><th>Nature</th><th>Début</th><th>Fin</th><th>Temps non payé</th></tr></thead>
    <tbody>${absenceRows || '<tr><td colspan="5">Aucun arrêt, absence ou suspension enregistré.</td></tr>'}</tbody></table>
    ${endRows ? `<h2 class="ft-title">Sommes versées à l’occasion de la rupture</h2>
    <table><thead><tr><th>Période de paie</th><th>Date de paiement</th><th>Temps travaillé/payé</th><th>Temps non payé</th><th>Salaire brut soumis aux contributions</th></tr></thead>
    <tbody>${ruptureSalaryRows}</tbody></table>
    <h2 class="ft-title">Indemnités de fin de contrat</h2>
    <table><thead><tr><th>Mois</th><th>Date de fin</th><th>Motif</th><th>CP bruts</th><th>Précarité brute</th><th>Indemnité légale</th><th>Autres indemnités</th><th>CP nets / jours</th><th>Rupture nette</th><th>Total net</th></tr></thead>
    <tbody>${endRows}</tbody></table>` : ""}
    <footer>Ce document est un registre employeur et un mémo de saisie généré par NounouCalc. Il ne remplace ni les bulletins Pajemploi, ni le solde de tout compte, ni l’attestation officielle France Travail transmise via Pajemploi.</footer>
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

function recalculateImportedState(importedState) {
  for (const [period, bucket] of Object.entries(importedState.declarations || {})) {
    for (const record of bucket?.simulations || []) {
      record.input = { ...record.input, period };
      record.results = calculateDeclaration(importedState.contract, record.input);
      record.results.cmg = calculateCmg(importedState.cmgProfile || defaultState().cmgProfile, record.results);
      record.results.cmg.officialCmg = number(record.input.officialCmg);
      record.results.cmg.officialPajemploiDebit = number(record.input.officialPajemploiDebit);
    }
  }
  return importedState;
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
    state = recalculateImportedState(
      importedState.version === DATA_VERSION ? importedState : upgradeV2(importedState)
    );
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
    setMonthlyValues({ ...defaultMonthly(draft.period), ...draft.input });
    currentSimulationId = draft.simulationId || null;
    currentRecord = currentSimulationId
      ? monthBucket(draft.period)?.simulations?.find(item => item.id === currentSimulationId) || null
      : null;
    $("monthStatus").textContent = "Brouillon restauré après mise à jour";
    $("results").classList.add("hidden");
    updateMonthlyEndVisibility(false);
    updateAutomaticLeaveInfo();
    updatePeriodHints();
    toast("Mise à jour installée sans perdre le brouillon en cours.");
  } catch (error) {
    console.warn("Brouillon de mise à jour illisible", error);
  }
}

async function fetchBuildId() {
  try {
    const response = await fetch("https://api.github.com/repos/sicho95/Nounou/commits/main", {
      cache: "no-store",
      headers: { Accept: "application/vnd.github+json" }
    });
    if (response.ok) return (await response.json()).sha;
  } catch (error) {
    console.debug("Commit distant indisponible, repli sur build.json", error);
  }
  const fallback = await fetch(`build.json?ts=${Date.now()}`, { cache: "no-store" });
  if (!fallback.ok) throw new Error(`build.json ${fallback.status}`);
  return (await fallback.json()).build;
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
contractIds.forEach(id => $(id).addEventListener("input", () => {
  if (id === "netHourlyRate") refreshEstimatedGrossRate();
  updateContractPreview();
  updateAutomaticLeaveInfo();
}));
$("period").addEventListener("change", event => loadMonth(event.target.value));
$("newSimulationButton").addEventListener("click", newSimulation);
$("isEndContract").addEventListener("change", () => updateMonthlyEndVisibility(true));
$("endDateMonthly").addEventListener("change", calculateMonthlyEndSuggestions);
$("endReasonMonthly").addEventListener("change", calculateMonthlyEndSuggestions);
$("recalculateEndButton").addEventListener("click", calculateMonthlyEndSuggestions);
$("leaveAdjustmentWeeks").addEventListener("input", updateAutomaticLeaveInfo);
$("actualDays").addEventListener("change", updateActualActivityDefaults);
$("saveContractButton").addEventListener("click", () => saveContract(true));
$("calculateButton").addEventListener("click", calculateAndSave);
$("confirmOfficialButton").addEventListener("click", () => {
  if (!currentRecord || !currentSimulationId) return alert("Enregistrez d’abord cette simulation.");
  validateSimulation(currentRecord.input.period, currentSimulationId);
});
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

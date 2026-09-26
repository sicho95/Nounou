import test from "node:test";
import assert from "node:assert/strict";
import { calculateChildAbsence, calculateDeclaration, defaultState, scheduledDaysInMonth } from "../core.mjs";
import { createContract, ensurePortfolio, switchContract, syncActiveContract } from "../portfolio.mjs";

const base = {
  ...defaultState().contract,
  startDate: "2025-09-08",
  weeksPerYear: 46,
  daysPerWeek: 5,
  normalHoursPerWeek: 40,
  majorHoursPerWeek: 0,
  netHourlyRate: 4.6,
  monthlyBaseNetSalary: 705.33
};

function absence(period, changes = {}) {
  const days = scheduledDaysInMonth(base, period);
  return {
    period, actualDays: days - 2, meals: days - 2,
    actualCareHours: (days - 2) * 8,
    childAbsenceKind: "short", childAbsenceProof: "yes",
    childAbsenceStartDate: `${period}-15`, childAbsenceEndDate: `${period}-16`,
    childAbsenceDays: 2, childAbsenceHours: 16,
    scheduledHoursInMonth: days * 8,
    ...changes
  };
}

test("année incomplète : déduit les jours réellement prévus, pas la moyenne mensuelle", () => {
  const input = absence("2026-03");
  const result = calculateDeclaration(base, input);
  const expected = Math.round(base.monthlyBaseNetSalary * 2 / scheduledDaysInMonth(base, input.period) * 100) / 100;
  assert.equal(result.childAbsence.deductionNet, expected);
  assert.equal(result.declared.days, input.actualDays);
  assert.equal(result.salary.absenceDeductionNet, expected);
  assert.ok(result.salary.estimatedGross < calculateDeclaration(base, { ...input, childAbsenceProof: "no" }).salary.estimatedGross);
  assert.equal(result.expenses.meals, input.meals * base.mealRate);
});

test("année complète : retient le rapport des heures réellement prévues", () => {
  const full = { ...base, weeksPerYear: 52 };
  const input = absence("2026-03", { childAbsenceDays: 1, childAbsenceHours: 4, scheduledHoursInMonth: 160 });
  const result = calculateChildAbsence(full, input);
  assert.equal(result.deductionNet, Math.round((base.monthlyBaseNetSalary * 4 / 160) * 100) / 100);
});

test("année incomplète : respecte un nombre de jours prévus corrigé pour les semaines sans accueil", () => {
  const result = calculateChildAbsence(base, absence("2026-03", { plannedDaysInMonth: 15 }));
  assert.equal(result.deductionNet, Math.round(base.monthlyBaseNetSalary * 2 / 15 * 100) / 100);
});

test("sans certificat, l'absence imprévue ne réduit pas le salaire", () => {
  const result = calculateDeclaration(base, absence("2026-03", { childAbsenceProof: "no" }));
  assert.equal(result.childAbsence.deductionNet, 0);
  assert.equal(result.declared.days, result.basis.declaredDays);
  assert.match(result.childAbsence.warning, /Sans certificat/);
});

test("le quota de 5 jours suit uniquement les déclarations confirmées de la même année anniversaire", () => {
  const previous = calculateDeclaration(base, absence("2026-02", { childAbsenceDays: 4, childAbsenceHours: 32 }));
  const official = { "2026-02": { input: absence("2026-02", { childAbsenceDays: 4, childAbsenceHours: 32 }), results: previous } };
  const current = calculateDeclaration(base, absence("2026-03"), official);
  assert.equal(current.childAbsence.previousShortDays, 4);
  assert.equal(current.childAbsence.deductedDays, 1);
  assert.match(current.childAbsence.warning, /Plafond/);
  const afterAnniversary = calculateDeclaration(base, absence("2026-10"), official);
  assert.equal(afterAnniversary.childAbsence.previousShortDays, 0);
});

test("l'absence longue ne déduit pas au-delà de 14 jours calendaires", () => {
  const result = calculateChildAbsence(base, absence("2026-03", {
    childAbsenceKind: "long", childAbsenceStartDate: "2026-03-01", childAbsenceEndDate: "2026-03-20",
    childAbsenceDays: 15, childAbsenceHours: 120
  }));
  assert.equal(result.calendarDays, 20);
  assert.equal(result.deductedDays, 10);
  assert.match(result.warning, /14 jours/);
});

test("un nouveau contrat ne remplace ni la nounou ni les déclarations de l'ancien", () => {
  const state = ensurePortfolio(defaultState(), "ancien");
  state.admin.employeeName = "Ancienne nounou";
  state.admin.employerName = "Famille test";
  state.declarations["2026-07"] = { simulations: [{ id: "officiel" }], officialId: "officiel" };
  syncActiveContract(state);
  createContract(state, "nouveau");
  assert.equal(state.admin.employeeName, "");
  assert.equal(state.admin.employerName, "Famille test");
  assert.deepEqual(state.declarations, {});
  state.admin.employeeName = "Nouvelle nounou";
  switchContract(state, "ancien");
  assert.equal(state.admin.employeeName, "Ancienne nounou");
  assert.equal(state.declarations["2026-07"].officialId, "officiel");
  switchContract(state, "nouveau");
  assert.equal(state.admin.employeeName, "Nouvelle nounou");
});

test("une sauvegarde mono-contrat ancienne est préservée et tous les contrats survivent au JSON", () => {
  const legacy = defaultState();
  legacy.version = 9;
  legacy.admin.employeeName = "Première nounou";
  legacy.declarations["2026-07"] = { simulations: [{ id: "saisie" }], officialId: "saisie" };
  ensurePortfolio(legacy);
  createContract(legacy, "second");
  legacy.admin.employeeName = "Seconde nounou";
  const restored = ensurePortfolio(JSON.parse(JSON.stringify(syncActiveContract(legacy))));
  switchContract(restored, "contrat-initial");
  assert.equal(restored.admin.employeeName, "Première nounou");
  assert.equal(restored.declarations["2026-07"].officialId, "saisie");
  switchContract(restored, "second");
  assert.equal(restored.admin.employeeName, "Seconde nounou");
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateCmg,
  calculateDeclaration,
  calculateEnd,
  contractBasis,
  globalLeaveBalance,
  leaveSummary,
  referencePeriod
} from "../core.mjs";

const contract = {
  startDate: "2026-09-01",
  weeksPerYear: 46,
  daysPerWeek: 5,
  normalHoursPerWeek: 40,
  majorHoursPerWeek: 2,
  netHourlyRate: 4,
  grossHourlyRate: 5.2,
  majorMarkup: 25,
  complementaryMarkup: 10,
  maintenanceRate: 3.8,
  mealRate: 4
};

test("calcule les bases mensualisées et leurs arrondis déclaratifs", () => {
  const basis = contractBasis(contract);
  assert.equal(basis.daysExact, 19.1667);
  assert.equal(basis.declaredDays, 19);
  assert.equal(basis.normalHoursExact, 153.3333);
  assert.equal(basis.declaredNormalHours, 153);
  assert.equal(basis.declaredContractMajorHours, 8);
});

test("sépare salaire exact, heures déclarées et indemnités", () => {
  const result = calculateDeclaration(contract, {
    period: "2026-09",
    actualDays: 18,
    meals: 17,
    equivalentWeeks: 3.83,
    complementaryHours: 2,
    extraMajorHours: 1,
    cpDaysDeclared: 0,
    cpPaidNet: 0,
    kilometerAllowance: 12,
    advancePaid: 10,
    specificHours: "no",
    over24Hours: "no",
    disabilityCare: "no",
    otherSalaryNet: 0,
    absenceDeductionNet: 10,
    officialGross: ""
  });
  assert.equal(result.declared.days, 19);
  assert.equal(result.declared.normalHours, 153);
  assert.equal(result.declared.complementaryHours, 2);
  assert.equal(result.declared.majorHours, 9);
  assert.equal(result.expenses.maintenance, 68.4);
  assert.equal(result.expenses.meals, 68);
  assert.equal(result.totalToPay, 793.87);
});

test("convertit les congés payés en heures normales à déclarer", () => {
  const result = calculateDeclaration(contract, {
    period: "2027-06",
    actualDays: 20,
    meals: 20,
    equivalentWeeks: 3.83,
    complementaryHours: 0,
    extraMajorHours: 0,
    cpDaysDeclared: 24,
    cpPaidNet: 929.20,
    otherSalaryNet: 0,
    absenceDeductionNet: 0
  });
  assert.equal(result.paidLeaveConversion.hours, 232.3);
  assert.equal(result.declared.normalHours, 386);
});

test("rattache janvier à la période de référence commencée en juin précédent", () => {
  assert.equal(referencePeriod("2027-01").key, "2026");
  assert.equal(referencePeriod("2027-06").key, "2027");
});

test("cumule et plafonne les congés acquis à 30 jours", () => {
  const declarations = {};
  for (let month = 1; month <= 12; month += 1) {
    const period = month >= 6
      ? `2026-${String(month).padStart(2, "0")}`
      : `2027-${String(month).padStart(2, "0")}`;
    declarations[period] = {
      input: { period, cpDaysDeclared: month === 6 ? 10 : 0, cpReferenceKey: month === 6 ? "2025" : "2026" },
      results: { leave: { acquiredRaw: 3 } }
    };
  }
  const summary = leaveSummary(declarations, "2027-05");
  assert.equal(summary.acquiredRaw, 30);
  assert.equal(summary.paidDays, 0);
  assert.equal(summary.remainingDays, 30);
});

test("un paiement en juin solde l'ancienne période sans effacer les nouveaux droits", () => {
  const declarations = {
    "2027-05": {
      input: { period: "2027-05", cpDaysDeclared: 0, cpReferenceKey: "2026" },
      results: { leave: { acquiredRaw: 24 } }
    },
    "2027-06": {
      input: { period: "2027-06", cpDaysDeclared: 24, cpReferenceKey: "2026" },
      results: { leave: { acquiredRaw: 2.4 } }
    },
    "2027-07": {
      input: { period: "2027-07", cpDaysDeclared: 0, cpReferenceKey: "2027" },
      results: { leave: { acquiredRaw: 2.4 } }
    }
  };
  const june = leaveSummary(declarations, "2027-06");
  const total = globalLeaveBalance(declarations, "2027-07");
  assert.equal(june.acquiredRaw, 4.8);
  assert.equal(june.paidDays, 0);
  assert.equal(total.acquiredDays, 28.8);
  assert.equal(total.paidDays, 24);
  assert.equal(total.remainingDays, 4.8);
});

test("un paiement ancien ne consomme jamais les nouveaux droits si l'historique ancien manque", () => {
  const declarations = {
    "2027-06": {
      input: { period: "2027-06", cpDaysDeclared: 24, cpReferenceKey: "2026" },
      results: { leave: { acquiredRaw: 2.4 } }
    },
    "2027-07": {
      input: { period: "2027-07", cpDaysDeclared: 0, cpReferenceKey: "2027" },
      results: { leave: { acquiredRaw: 2.4 } }
    }
  };
  const total = globalLeaveBalance(declarations, "2027-07");
  assert.equal(total.remainingDays, 4.8);
});

test("calcule l'indemnité de rupture après neuf mois à partir du brut historisé", () => {
  const declarations = {
    "2026-09": { input: { period: "2026-09" }, results: { salary: { grossForHistory: 800 } } },
    "2026-10": { input: { period: "2026-10" }, results: { salary: { grossForHistory: 800 } } }
  };
  const result = calculateEnd(contract, declarations, {
    endDate: "2027-07-01",
    reason: "employer",
    regularizationDueNet: 500,
    regularizationPaidNet: 450,
    endingCpNet: 100,
    lastSalaryNet: 600
  });
  assert.equal(result.ruptureIndemnity, 20);
  assert.equal(result.regularization, 50);
  assert.equal(result.total, 770);
});

test("estime le CMG 2026 avec ressources N-2, enfants et coût horaire", () => {
  const cmg = calculateCmg(
    { annualResourcesN2: 61500, dependentChildren: 2, aeeh: "no" },
    {
      declared: { normalHours: 150, complementaryHours: 0, majorHours: 0, netSalary: 949.5 },
      expenses: { maintenance: 30, meals: 10 }
    }
  );
  assert.equal(cmg.monthlyResources, 5125);
  assert.equal(cmg.effortRate, 0.000516);
  assert.equal(cmg.eligibleCost, 989.5);
  assert.equal(cmg.actualHourlyCost, 6.5967);
  assert.equal(cmg.estimatedCmg, 456.56);
  assert.equal(cmg.estimatedOutOfPocket, 532.94);
});

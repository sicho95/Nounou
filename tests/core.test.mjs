import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateCmg,
  calculateDeclaration,
  calculateEnd,
  calculateMaintenanceAllowance,
  cmgProfileAt,
  contractBasis,
  defaultState,
  estimatedGrossHourlyRate,
  globalLeaveBalance,
  leaveSummary,
  referencePeriod,
  scheduledDaysInMonth
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

test("prévoit les identifiants nécessaires au mémo France Travail", () => {
  const state = defaultState();

  assert.equal(state.contract.contractNumber, "00000");
  assert.equal(state.contract.lastJobTitle, "Assistante maternelle agréée");
  assert.equal(state.admin.employeeRetirementFund, "Régime unifié AGIRC-ARRCO");
  assert.equal(state.admin.employeeNationality, "france");
});

test("calcule les bases mensualisées et leurs arrondis déclaratifs", () => {
  const basis = contractBasis(contract);
  assert.equal(basis.daysExact, 19.1667);
  assert.equal(basis.declaredDays, 20);
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
  assert.equal(result.declared.days, 20);
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
  const fullYear = { ...contract, startDate: "2026-06-01", weeksPerYear: 52 };
  const summary = leaveSummary(fullYear, {}, "2027-05", null, "2027-05-31");
  assert.equal(summary.acquiredRaw, 30);
  assert.equal(summary.paidDays, 0);
  assert.equal(summary.remainingDays, 30);
});

test("un paiement en juin solde l'ancienne période sans effacer les nouveaux droits", () => {
  const juneContract = { ...contract, startDate: "2026-06-01" };
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
  const june = leaveSummary(juneContract, declarations, "2027-06", null, "2027-06-30");
  const total = globalLeaveBalance(juneContract, declarations, "2027-07-31");
  assert.equal(june.paidDays, 0);
  assert.ok(june.acquiredRaw > 0);
  assert.equal(total.paidByReference["2026"], 24);
  assert.ok(total.remainingDays > 0);
});

test("calcule depuis la date de début même sans historique et ajoute les jours enfant à la clôture", () => {
  const screenshotContract = {
    ...contract,
    startDate: "2025-09-08",
    employeeDependentChildrenUnder15: 1
  };
  const balance = globalLeaveBalance(screenshotContract, {}, "2026-05-31");
  assert.equal(balance.periods["2025"].annualDays, 22);
  assert.equal(balance.periods["2025"].childDays, 2);
  assert.equal(balance.remainingDays, 24);
});

test("conserve l’arrondi et les jours enfant d’une période clôturée après le 31 mai", () => {
  const screenshotContract = {
    ...contract,
    startDate: "2025-09-08",
    employeeDependentChildrenUnder15: 1
  };
  const balance = globalLeaveBalance(screenshotContract, {}, "2026-07-31");

  assert.equal(balance.periods["2025"].closed, true);
  assert.equal(balance.periods["2025"].annualDays, 22);
  assert.equal(balance.periods["2025"].childDays, 2);
  assert.equal(balance.periods["2025"].totalDays, 24);
});

test("propose automatiquement les jours ouvrés du mois", () => {
  const julyContract = { ...contract, startDate: "2025-09-08", daysPerWeek: 5 };
  assert.equal(scheduledDaysInMonth(julyContract, "2026-07"), 23);
  assert.equal(scheduledDaysInMonth(julyContract, "2026-07", "2026-07-24"), 18);
});

test("arrondit les jours mensualisés à l'entier supérieur comme l'exemple Urssaf", () => {
  const basis = contractBasis({ ...contract, weeksPerYear: 52, daysPerWeek: 4 });
  assert.equal(basis.daysExact, 17.3333);
  assert.equal(basis.declaredDays, 18);
});

test("applique automatiquement le minimum d'entretien 2026 selon les heures réelles", () => {
  const beforeJune = calculateMaintenanceAllowance(
    { ...contract, maintenanceRate: 0, normalHoursPerWeek: 50, majorHoursPerWeek: 0 },
    { period: "2026-05", actualDays: 16, actualCareHours: 160 }
  );
  const afterJune = calculateMaintenanceAllowance(
    { ...contract, maintenanceRate: 0, normalHoursPerWeek: 50, majorHoursPerWeek: 0 },
    { period: "2026-06", actualDays: 22, actualCareHours: 220 }
  );
  assert.equal(beforeJune.daily, 4.26);
  assert.equal(beforeJune.total, 68.16);
  assert.equal(afterJune.daily, 4.36);
  assert.equal(afterJune.total, 95.92);
});

test("estime le brut automatiquement quand seul le taux net est connu", () => {
  assert.equal(estimatedGrossHourlyRate(4.6), 5.8884);
  const result = calculateDeclaration({ ...contract, grossHourlyRate: 0 }, {
    period: "2026-07",
    actualDays: 20,
    meals: 20
  });
  assert.equal(result.salary.grossSource, "estimated");
  assert.ok(result.salary.estimatedGross > result.salary.netSalary);
});

test("retrouve les 2,75 jours acquis en juin montrés par NounouTop", () => {
  const juneContract = { ...contract, startDate: "2025-09-08", daysPerWeek: 5 };
  const draft = {
    period: "2026-06",
    input: {
      period: "2026-06",
      actualDays: 22,
      autoLeaveAccrual: true,
      leaveAdjustmentWeeks: 0
    }
  };
  const summary = leaveSummary(juneContract, {}, "2026-06", draft, "2026-06-30");
  const declaration = calculateDeclaration(juneContract, draft.input);

  assert.equal(summary.monthEquivalentWeeks, 4.4);
  assert.equal(summary.monthAcquiredRaw, 2.75);
  assert.equal(declaration.leave.acquiredRaw, 2.75);
});

test("une fin de contrat ajoute les indemnités au salaire et au total à payer", () => {
  const result = calculateDeclaration(contract, {
    period: "2027-07",
    actualDays: 18,
    meals: 18,
    complementaryHours: 0,
    extraMajorHours: 0,
    cpDaysDeclared: 0,
    cpPaidNet: 0,
    isEndContract: "yes",
    endDate: "2027-07-31",
    endingCpNet: 317.44,
    endingCpDays: 3,
    noticeCompensationNet: 0,
    precariousnessNet: 0,
    endingRegularizationNet: 0,
    ruptureIndemnityNet: 172.38,
    otherSalaryNet: 0,
    absenceDeductionNet: 0
  });
  assert.equal(result.ending.active, true);
  assert.equal(result.declared.cpDays, 3);
  assert.equal(result.paidLeaveConversion.hours, 79.36);
  assert.equal(Math.round((result.totalToPay - result.declared.netSalary - result.expenses.total) * 100) / 100, 172.38);
});

test("ajoute les équivalents de régularisation aux heures et jours Pajemploi avec plafond à 31 jours", () => {
  const result = calculateDeclaration(contract, {
    period: "2027-07",
    actualDays: 18,
    meals: 18,
    isEndContract: "yes",
    endingRegularizationNet: 544.55,
    endingRegularizationHours: 118.38,
    endingRegularizationDays: 13.99
  });

  assert.equal(result.declared.days, 31);
  assert.equal(result.declared.normalHours, Math.round(result.basis.normalHoursExact + 118.38));
  assert.equal(result.regularizationConversion.hours, 118.38);
  assert.equal(result.regularizationConversion.days, 13.99);
  assert.equal(result.regularizationConversion.cappedAt31Days, true);
});

test("un paiement ancien ne consomme jamais les nouveaux droits si l'historique ancien manque", () => {
  const juneContract = { ...contract, startDate: "2027-06-01" };
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
  const total = globalLeaveBalance(juneContract, declarations, "2027-07-31");
  assert.ok(total.periods["2027"].remainingDays > 0);
  assert.equal(total.periods["2026"].remainingDays, 0);
});

test("la fin de contrat solde d’abord les congés impayés les plus anciens", () => {
  const endingContract = {
    ...contract,
    startDate: "2025-09-08",
    daysPerWeek: 5,
    employeeDependentChildrenUnder15: 1
  };
  const declarations = {
    "2026-07": {
      input: {
        period: "2026-07",
        actualDays: 23,
        autoLeaveAccrual: true,
        endingCpDays: 100
      }
    }
  };
  const afterPayment = globalLeaveBalance(endingContract, declarations, "2026-07-31");

  assert.equal(afterPayment.periods["2025"].paidDays, 24);
  assert.equal(afterPayment.remainingDays, 0);
});

test("calcule l'indemnité de rupture après neuf mois avec estimation des mois manquants", () => {
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
  assert.equal(result.ruptureIndemnity, 117.74);
  assert.equal(result.regularization, 50);
  assert.equal(result.automaticRegularizationHours, 12.5);
  assert.equal(result.total, 867.74);
  assert.equal(result.estimatedMonthsCount, 9);
});

test("convertit la régularisation nette en heures normales comme NounouTop", () => {
  const result = calculateEnd(
    { ...contract, netHourlyRate: 4.6 },
    {},
    {
      endDate: "2027-07-31",
      reason: "employer",
      regularizationDueNet: 544.55,
      regularizationPaidNet: 0,
      endingCpNet: 0,
      lastSalaryNet: 0
    }
  );

  assert.equal(result.regularization, 544.55);
  assert.equal(result.automaticRegularizationHours, 118.38);
});

test("retrouve le 1/80 NounouTop en incluant le mois de fin et les congés bruts de rupture", () => {
  const grossByPeriod = {
    "2025-09": 670.79,
    "2025-10": 1088.37,
    "2025-11": 1031.45,
    "2025-12": 1088.37,
    "2026-01": 1088.37,
    "2026-02": 1088.37,
    "2026-03": 1088.37,
    "2026-04": 1088.37,
    "2026-05": 1088.37,
    "2026-06": 2280.76,
    "2026-07": 1782.71
  };
  const declarations = Object.fromEntries(Object.entries(grossByPeriod).map(([period, gross]) => [
    period,
    {
      input: {
        period,
        officialGross: gross,
        endingCpGross: period === "2026-07" ? 406.35 : ""
      },
      results: {
        salary: { grossForHistory: gross },
        ending: { noticeCompensationNet: 0 }
      }
    }
  ]));
  const result = calculateEnd(
    { ...contract, startDate: "2025-09-08" },
    declarations,
    {
      endDate: "2026-07-31",
      reason: "employer",
      regularizationDueNet: 0,
      regularizationPaidNet: 0,
      endingCpNet: 317.44,
      lastSalaryNet: 0
    }
  );

  assert.equal(result.grossSalaryHistory, 13384.3);
  assert.equal(result.cpCompensationGrossForRupture, 406.35);
  assert.equal(result.ruptureGrossBase, 13790.65);
  assert.equal(result.suggestedRuptureIndemnity, 172.38);
});

test("calcule la régularisation, les congés et le dernier salaire sans montant saisi", () => {
  const input = {
    period: "2026-09",
    actualDays: 20,
    actualCareHours: 168,
    meals: 20,
    partialMeals: 0,
    complementaryHours: 0,
    extraMajorHours: 0,
    cpDaysDeclared: 0,
    cpPaidNet: 0,
    absenceDeductionNet: 0,
    otherSalaryNet: 0,
    kilometerAllowance: 0,
    advancePaid: 0,
    isEndContract: "no"
  };
  const declaration = { period: input.period, input, results: calculateDeclaration(contract, input) };
  const result = calculateEnd(contract, { "2026-09": declaration }, {
    endDate: "2026-09-30",
    reason: "employer",
    regularizationDueNet: "",
    regularizationPaidNet: "",
    endingCpNet: "",
    lastSalaryNet: ""
  });

  assert.ok(result.regularization > 0);
  assert.ok(result.automaticRegularizationHours >= 0);
  assert.ok(result.automaticRegularizationDays >= 0);
  assert.ok(result.cpCompensation > 0);
  assert.equal(result.lastSalary, declaration.results.totalToPay);
  assert.equal(result.total, Number((result.regularization + result.cpCompensation + result.lastSalary).toFixed(2)));
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

test("n'invente pas un CMG lorsque les ressources CAF manquent", () => {
  const cmg = calculateCmg(
    { annualResourcesN2: "", dependentChildren: 1, aeeh: "no" },
    {
      declared: { normalHours: 150, complementaryHours: 0, majorHours: 0, netSalary: 949.5 },
      expenses: { maintenance: 30, meals: 10 },
      totalToPay: 1009.5
    }
  );

  assert.equal(cmg.configured, false);
  assert.equal(cmg.estimatedCmg, null);
  assert.equal(cmg.estimatedOutOfPocket, null);
});

test("le reste à charge CMG conserve les frais non éligibles du total versé", () => {
  const cmg = calculateCmg(
    { annualResourcesN2: 61500, dependentChildren: 2, aeeh: "no" },
    {
      declared: { normalHours: 150, complementaryHours: 0, majorHours: 0, netSalary: 949.5 },
      expenses: { maintenance: 30, meals: 10, kilometers: 20 },
      totalToPay: 1009.5
    }
  );

  assert.equal(cmg.estimatedCmg, 456.56);
  assert.equal(cmg.estimatedOutOfPocket, 552.94);
});

test("retrouve l'estimation CMG du jeu de contrôle familial de juillet 2026", () => {
  const cmg = calculateCmg(
    { annualResourcesN2: 59700, dependentChildren: 2, aeeh: "no" },
    {
      declared: { normalHours: 165, complementaryHours: 0, majorHours: 18, netSalary: 851.77 },
      expenses: { maintenance: 100.16, meals: 112, kilometers: 0 },
      totalToPay: 1063.93
    }
  );

  assert.equal(cmg.estimatedCmg, 507.67);
  assert.equal(cmg.estimatedOutOfPocket, 556.26);
  assert.equal(cmg.estimatedAidRate, 47.7);
});

test("applique chaque ressource CMG uniquement à partir de son mois d'effet", () => {
  const history = [
    { effectivePeriod: "2025-09", annualResourcesN2: 50000 },
    { effectivePeriod: "2026-08", annualResourcesN2: 59700 }
  ];

  assert.equal(cmgProfileAt(history, {}, "2026-07").annualResourcesN2, 50000);
  assert.equal(cmgProfileAt(history, {}, "2026-08").annualResourcesN2, 59700);
  assert.equal(cmgProfileAt(history, {}, "2027-01").annualResourcesN2, 59700);
});

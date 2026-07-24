export const DATA_VERSION = 3;

export function number(value, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((number(value) + Number.EPSILON) * factor) / factor;
}

export function money(value) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR"
  }).format(number(value));
}

export function monthLabel(period) {
  if (!/^\d{4}-\d{2}$/.test(period || "")) return "Période inconnue";
  const [year, month] = period.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" })
    .format(new Date(year, month - 1, 1));
}

export function referencePeriod(period) {
  if (!/^\d{4}-\d{2}$/.test(period || "")) return { key: "", label: "" };
  const [year, month] = period.split("-").map(Number);
  const startYear = month >= 6 ? year : year - 1;
  return { key: String(startYear), label: `1er juin ${startYear} – 31 mai ${startYear + 1}` };
}

export function completedMonths(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  let months = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth();
  if (end.getDate() < start.getDate()) months -= 1;
  return Math.max(0, months);
}

export function contractBasis(contract) {
  const weeks = Math.min(52, Math.max(0, number(contract.weeksPerYear)));
  const daysWeekly = Math.max(0, number(contract.daysPerWeek));
  const normalWeekly = Math.max(0, number(contract.normalHoursPerWeek));
  const majorWeekly = Math.max(0, number(contract.majorHoursPerWeek));
  const daysExact = daysWeekly * weeks / 12;
  const normalExact = normalWeekly * weeks / 12;
  const majorExact = majorWeekly * weeks / 12;

  return {
    daysExact: round(daysExact, 4),
    declaredDays: Math.round(daysExact),
    normalHoursExact: round(normalExact, 4),
    declaredNormalHours: Math.round(normalExact),
    majorHoursExact: round(majorExact, 4),
    declaredContractMajorHours: Math.round(majorExact)
  };
}

export function calculateDeclaration(contract, input) {
  const basis = contractBasis(contract);
  const netRate = Math.max(0, number(contract.netHourlyRate));
  const grossRate = Math.max(0, number(contract.grossHourlyRate));
  const majorFactor = 1 + Math.max(0, number(contract.majorMarkup)) / 100;
  const complementaryFactor = 1 + Math.max(0, number(contract.complementaryMarkup)) / 100;
  const complementaryHours = Math.max(0, number(input.complementaryHours));
  const extraMajorHours = Math.max(0, number(input.extraMajorHours));
  const cpPaidNet = Math.max(0, number(input.cpPaidNet));
  const otherSalaryNet = number(input.otherSalaryNet);
  const deduction = Math.max(0, number(input.absenceDeductionNet));

  const normalNet = basis.normalHoursExact * netRate;
  const contractMajorNet = basis.majorHoursExact * netRate * majorFactor;
  const complementaryNet = complementaryHours * netRate * complementaryFactor;
  const extraMajorNet = extraMajorHours * netRate * majorFactor;
  const salaryBeforeDeduction = normalNet + contractMajorNet + complementaryNet + extraMajorNet + cpPaidNet + otherSalaryNet;
  const netSalary = Math.max(0, salaryBeforeDeduction - deduction);

  const normalGross = basis.normalHoursExact * grossRate;
  const contractMajorGross = basis.majorHoursExact * grossRate * majorFactor;
  const complementaryGross = complementaryHours * grossRate * complementaryFactor;
  const extraMajorGross = extraMajorHours * grossRate * majorFactor;
  const estimatedGross = grossRate > 0
    ? Math.max(0, normalGross + contractMajorGross + complementaryGross + extraMajorGross)
    : 0;
  const officialGross = Math.max(0, number(input.officialGross));

  const maintenance = Math.max(0, number(input.actualDays)) * Math.max(0, number(contract.maintenanceRate));
  const meals = Math.max(0, number(input.meals)) * Math.max(0, number(contract.mealRate));
  const kilometers = Math.max(0, number(input.kilometerAllowance));
  const advancePaid = Math.max(0, number(input.advancePaid));
  const acquiredRaw = Math.max(0, number(input.equivalentWeeks)) * 2.5 / 4;
  const cpHours = netRate > 0 ? cpPaidNet / netRate : 0;
  const normalHoursWithPaidLeave = basis.normalHoursExact + cpHours;

  return {
    basis,
    declared: {
      days: basis.declaredDays,
      normalHours: Math.round(normalHoursWithPaidLeave),
      complementaryHours: round(complementaryHours, 2),
      majorHours: round(basis.declaredContractMajorHours + extraMajorHours, 2),
      cpDays: round(Math.max(0, number(input.cpDaysDeclared)), 2),
      netSalary: round(netSalary)
    },
    salary: {
      normalNet: round(normalNet),
      contractMajorNet: round(contractMajorNet),
      complementaryNet: round(complementaryNet),
      extraMajorNet: round(extraMajorNet),
      cpPaidNet: round(cpPaidNet),
      otherSalaryNet: round(otherSalaryNet),
      absenceDeductionNet: round(deduction),
      netSalary: round(netSalary),
      estimatedGross: round(estimatedGross),
      grossForHistory: round(officialGross || estimatedGross),
      grossSource: officialGross ? "official" : (estimatedGross ? "estimated" : "missing")
    },
    expenses: {
      maintenance: round(maintenance),
      meals: round(meals),
      kilometers: round(kilometers),
      total: round(maintenance + meals + kilometers)
    },
    advancePaid: round(advancePaid),
    totalToPay: round(Math.max(0, netSalary + maintenance + meals + kilometers - advancePaid)),
    paidLeaveConversion: {
      hours: round(cpHours, 4),
      normalHoursWithPaidLeave: round(normalHoursWithPaidLeave, 4)
    },
    additional: {
      specificHours: input.specificHours === "yes",
      over24Hours: input.over24Hours === "yes",
      disabilityCare: input.disabilityCare === "yes"
    },
    leave: {
      acquiredRaw: round(acquiredRaw, 4),
      reference: referencePeriod(input.period)
    }
  };
}

const CMG_EFFORT_RATES = [0.000619, 0.000516, 0.000413, 0.000310, 0.000310, 0.000310, 0.000310, 0.000206];

export function calculateCmg(cmgProfile, declaration) {
  const annualResources = Math.max(0, number(cmgProfile.annualResourcesN2));
  const monthlyResources = Math.min(8500, Math.max(814.02, annualResources / 12));
  const children = Math.max(1, Math.round(number(cmgProfile.dependentChildren, 1)));
  const aeehShift = cmgProfile.aeeh === "yes" ? 1 : 0;
  const rateIndex = Math.min(CMG_EFFORT_RATES.length - 1, children - 1 + aeehShift);
  const effortRate = CMG_EFFORT_RATES[rateIndex];
  const declared = declaration.declared || {};
  const hours = Math.max(0,
    number(declared.normalHours) + number(declared.complementaryHours) + number(declared.majorHours)
  );
  const eligibleCost = Math.max(0,
    number(declared.netSalary) +
    number(declaration.expenses?.maintenance) +
    number(declaration.expenses?.meals)
  );
  const actualHourlyCost = hours > 0 ? eligibleCost / hours : 0;
  const hourlyCap = 8.09;
  const referenceHourlyCost = 4.91;
  const retainedHourlyCost = Math.min(actualHourlyCost, hourlyCap);
  const retainedCost = retainedHourlyCost * hours;
  const familyParticipation = hours * monthlyResources * effortRate *
    (referenceHourlyCost > 0 ? retainedHourlyCost / referenceHourlyCost : 0);
  const estimatedCmg = Math.max(0, Math.min(retainedCost, retainedCost - familyParticipation));
  const estimatedOutOfPocket = Math.max(0, eligibleCost - estimatedCmg);

  return {
    annualResources: round(annualResources),
    monthlyResources: round(monthlyResources),
    dependentChildren: children,
    effortRate,
    hours: round(hours, 2),
    eligibleCost: round(eligibleCost),
    actualHourlyCost: round(actualHourlyCost, 4),
    retainedHourlyCost: round(retainedHourlyCost, 4),
    referenceHourlyCost,
    hourlyCap,
    estimatedCmg: round(estimatedCmg),
    estimatedOutOfPocket: round(estimatedOutOfPocket),
    overCapCost: round(Math.max(0, eligibleCost - retainedCost))
  };
}

export function leaveSummary(declarations, period, draft = null) {
  const ref = referencePeriod(period);
  const byPeriod = Object.values(declarations || {}).filter(item =>
    referencePeriod(item.input?.period || item.period).key === ref.key
  );
  let acquiredRaw = byPeriod.reduce((sum, item) => sum + number(item.results?.leave?.acquiredRaw), 0);
  let paidDays = Object.values(declarations || {}).reduce((sum, item) => {
    const itemPeriod = item.input?.period || item.period;
    const paidReference = item.input?.cpReferenceKey || referencePeriod(itemPeriod).key;
    return paidReference === ref.key ? sum + number(item.input?.cpDaysDeclared) : sum;
  }, 0);

  if (draft && !declarations?.[draft.period]) {
    acquiredRaw += number(draft.results?.leave?.acquiredRaw);
    const paidReference = draft.input?.cpReferenceKey || referencePeriod(draft.period).key;
    if (paidReference === ref.key) paidDays += number(draft.input?.cpDaysDeclared);
  }

  const acquiredCapped = Math.min(30, acquiredRaw);
  return {
    reference: ref,
    acquiredRaw: round(acquiredCapped, 2),
    acquiredRoundedAtPeriodEnd: Math.min(30, Math.ceil(acquiredCapped - 1e-9)),
    paidDays: round(paidDays, 2),
    remainingDays: round(Math.max(0, acquiredCapped - paidDays), 2)
  };
}

export function globalLeaveBalance(declarations, untilPeriod = "") {
  const records = Object.values(declarations || {}).filter(item => {
    const period = item.input?.period || item.period;
    return period && (!untilPeriod || period <= untilPeriod);
  });
  const acquiredByReference = {};
  const paidByReference = {};

  for (const item of records) {
    const period = item.input?.period || item.period;
    const key = referencePeriod(period).key;
    const paidKey = item.input?.cpReferenceKey || key;
    acquiredByReference[key] = number(acquiredByReference[key]) + number(item.results?.leave?.acquiredRaw);
    paidByReference[paidKey] = number(paidByReference[paidKey]) + number(item.input?.cpDaysDeclared);
  }

  const acquiredDays = Object.values(acquiredByReference)
    .reduce((sum, value) => sum + Math.min(30, number(value)), 0);
  const paidDays = Object.values(paidByReference).reduce((sum, value) => sum + number(value), 0);
  const referenceKeys = new Set([...Object.keys(acquiredByReference), ...Object.keys(paidByReference)]);
  const remainingDays = [...referenceKeys].reduce((sum, key) => {
    const acquired = Math.min(30, number(acquiredByReference[key]));
    const paid = number(paidByReference[key]);
    return sum + Math.max(0, acquired - paid);
  }, 0);
  return {
    acquiredDays: round(acquiredDays, 2),
    paidDays: round(paidDays, 2),
    remainingDays: round(remainingDays, 2),
    acquiredByReference: Object.fromEntries(
      Object.entries(acquiredByReference).map(([key, value]) => [key, round(Math.min(30, value), 2)])
    ),
    paidByReference: Object.fromEntries(
      Object.entries(paidByReference).map(([key, value]) => [key, round(value, 2)])
    )
  };
}

export function calculateEnd(contract, declarations, input) {
  const endDate = input.endDate;
  const startDate = contract.startDate;
  const records = Object.values(declarations || {}).filter(item => {
    const period = item.input?.period || item.period;
    return period && (!endDate || `${period}-01` <= endDate);
  });
  const grossTotal = round(records.reduce((sum, item) => sum + number(item.results?.salary?.grossForHistory), 0));
  const seniorityMonths = completedMonths(startDate, endDate);
  const reason = input.reason;
  const ruptureEligible = reason === "death" || (reason === "employer" && seniorityMonths >= 9);
  const ruptureIndemnity = ruptureEligible ? round(grossTotal / 80) : 0;
  const cddIndemnity = reason === "cdd" ? round(grossTotal * 0.10) : 0;
  const regularization = round(Math.max(0, number(input.regularizationDueNet) - number(input.regularizationPaidNet)));
  const cpCompensation = round(Math.max(0, number(input.endingCpNet)));
  const lastSalary = round(Math.max(0, number(input.lastSalaryNet)));
  const untilPeriod = endDate ? endDate.slice(0, 7) : "";
  const leaveBalance = globalLeaveBalance(declarations, untilPeriod);
  const projectedAcquiredDays = round(Math.max(0, number(input.endingEquivalentWeeks)) * 2.5 / 4, 2);
  leaveBalance.projectedAcquiredDays = projectedAcquiredDays;
  leaveBalance.remainingWithProjection = round(leaveBalance.remainingDays + projectedAcquiredDays, 2);
  const total = round(ruptureIndemnity + cddIndemnity + regularization + cpCompensation + lastSalary);

  return {
    grossTotal,
    seniorityMonths,
    ruptureEligible,
    ruptureIndemnity,
    cddIndemnity,
    regularization,
    cpCompensation,
    lastSalary,
    leaveBalance,
    total,
    grossMissing: records.some(item => !number(item.results?.salary?.grossForHistory)),
    recordsCount: records.length
  };
}

export function defaultState() {
  return {
    version: DATA_VERSION,
    admin: {
      employerName: "",
      employerPajemploi: "",
      employerAddress: "",
      employeeName: "",
      employeeNumber: "",
      employeeAddress: "",
      approvalNumber: "",
      childName: "Noa",
      childBirthDate: ""
    },
    contract: {
      startDate: "",
      contractType: "CDI",
      weeksPerYear: 46,
      daysPerWeek: 5,
      normalHoursPerWeek: 40,
      majorHoursPerWeek: 0,
      netHourlyRate: 4,
      grossHourlyRate: 0,
      majorMarkup: 25,
      complementaryMarkup: 0,
      maintenanceRate: 3.8,
      mealRate: 4,
      cpPaymentMode: "june",
      cpPaymentMonth: 6
    },
    cmgProfile: {
      annualResourcesN2: 0,
      dependentChildren: 1,
      aeeh: "no"
    },
    preferences: {
      theme: "auto"
    },
    declarations: {}
  };
}

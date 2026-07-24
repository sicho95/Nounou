export const DATA_VERSION = 4;

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

export function estimatedGrossHourlyRate(netRate) {
  const employeeContributionRatio2026 = 0.7811975;
  return round(Math.max(0, number(netRate)) / employeeContributionRatio2026, 4);
}

export function maintenanceMinimumForPeriod(period) {
  if ((period || "") >= "2026-06") return 3.92;
  if ((period || "") >= "2026-01") return 3.83;
  if ((period || "") >= "2025-01") return 3.80;
  return 3.74;
}

export function calculateMaintenanceAllowance(contract, input) {
  const days = Math.max(0, number(input.actualDays));
  if (!days) return { total: 0, daily: 0, hours: 0, legalNineHours: maintenanceMinimumForPeriod(input.period) };
  const weeklyHours = Math.max(0, number(contract.normalHoursPerWeek) + number(contract.majorHoursPerWeek));
  const usualHoursPerDay = number(contract.daysPerWeek) > 0 ? weeklyHours / number(contract.daysPerWeek) : 0;
  const actualHours = Math.max(0, number(input.actualCareHours, days * usualHoursPerDay));
  const averageHoursPerDay = actualHours / days;
  const legalNineHours = maintenanceMinimumForPeriod(input.period);
  const agreedUsualDay = Math.max(0, number(contract.maintenanceRate));
  const agreedProrated = agreedUsualDay > 0 && usualHoursPerDay > 0
    ? agreedUsualDay * averageHoursPerDay / usualHoursPerDay
    : 0;
  const legalProrated = legalNineHours * averageHoursPerDay / 9;
  const daily = round(Math.max(2.65, agreedProrated, legalProrated));
  return {
    total: round(daily * days),
    daily,
    hours: round(actualHours, 2),
    averageHoursPerDay: round(averageHoursPerDay, 4),
    legalNineHours,
    agreedUsualDay,
    legalProrated: round(legalProrated, 4)
  };
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

function isoDate(value) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function periodFromDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function periodsBetween(startDate, endDate) {
  const start = isoDate(startDate);
  const end = isoDate(endDate);
  if (!start || !end || end < start) return [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1, 12);
  const last = new Date(end.getFullYear(), end.getMonth(), 1, 12);
  const periods = [];
  while (cursor <= last) {
    periods.push(periodFromDate(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return periods;
}

function scheduledWeekdays(contract) {
  const count = Math.max(0, Math.min(7, Math.round(number(contract.daysPerWeek))));
  return new Set(Array.from({ length: count }, (_, index) => index === 6 ? 0 : index + 1));
}

export function scheduledDaysInMonth(contract, period, endDate = "") {
  if (!/^\d{4}-\d{2}$/.test(period || "")) return 0;
  const [year, month] = period.split("-").map(Number);
  const allowed = scheduledWeekdays(contract);
  const startLimit = isoDate(contract.startDate);
  const endLimit = isoDate(endDate);
  let total = 0;
  for (let day = 1; day <= new Date(year, month, 0).getDate(); day += 1) {
    const date = new Date(year, month - 1, day, 12);
    if (startLimit && date < startLimit) continue;
    if (endLimit && date > endLimit) continue;
    if (allowed.has(date.getDay())) total += 1;
  }
  return total;
}

export function automaticAccrualWeeks(contract, period, endDate = "", adjustmentWeeks = 0) {
  if (!/^\d{4}-\d{2}$/.test(period || "")) return 0;
  const [year, month] = period.split("-").map(Number);
  const fullContract = { ...contract, startDate: "" };
  const fullDays = scheduledDaysInMonth(fullContract, period);
  const activeDays = scheduledDaysInMonth(contract, period, endDate);
  const fraction = fullDays > 0 ? activeDays / fullDays : 0;
  const annualWeeks = Math.max(0, number(contract.weeksPerYear));
  const weeks = (annualWeeks === 52 ? 4 : annualWeeks / 12) * fraction;
  return round(Math.max(0, weeks + number(adjustmentWeeks)), 4);
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
    declaredDays: Math.ceil(daysExact - 1e-9),
    normalHoursExact: round(normalExact, 4),
    declaredNormalHours: Math.round(normalExact),
    majorHoursExact: round(majorExact, 4),
    declaredContractMajorHours: Math.round(majorExact)
  };
}

export function calculateDeclaration(contract, input) {
  const basis = contractBasis(contract);
  const netRate = Math.max(0, number(contract.netHourlyRate));
  const grossRate = Math.max(0, number(contract.grossHourlyRate) || estimatedGrossHourlyRate(netRate));
  const majorFactor = 1 + Math.max(0, number(contract.majorMarkup)) / 100;
  const complementaryFactor = 1 + Math.max(0, number(contract.complementaryMarkup)) / 100;
  const complementaryHours = Math.max(0, number(input.complementaryHours));
  const extraMajorHours = Math.max(0, number(input.extraMajorHours));
  const cpPaidNet = Math.max(0, number(input.cpPaidNet));
  const endingCpNet = input.isEndContract === "yes" ? Math.max(0, number(input.endingCpNet)) : 0;
  const noticeCompensationNet = input.isEndContract === "yes" ? Math.max(0, number(input.noticeCompensationNet)) : 0;
  const precariousnessNet = input.isEndContract === "yes" ? Math.max(0, number(input.precariousnessNet)) : 0;
  const regularizationNet = input.isEndContract === "yes" ? Math.max(0, number(input.endingRegularizationNet)) : 0;
  const regularizationHours = input.isEndContract === "yes" ? Math.max(0, number(input.endingRegularizationHours)) : 0;
  const regularizationDays = input.isEndContract === "yes" ? Math.max(0, number(input.endingRegularizationDays)) : 0;
  const ruptureIndemnityNet = input.isEndContract === "yes" ? Math.max(0, number(input.ruptureIndemnityNet)) : 0;
  const otherSalaryNet = number(input.otherSalaryNet);
  const deduction = Math.max(0, number(input.absenceDeductionNet));

  const normalNet = basis.normalHoursExact * netRate;
  const contractMajorNet = basis.majorHoursExact * netRate * majorFactor;
  const complementaryNet = complementaryHours * netRate * complementaryFactor;
  const extraMajorNet = extraMajorHours * netRate * majorFactor;
  const salaryBeforeDeduction = normalNet + contractMajorNet + complementaryNet + extraMajorNet +
    cpPaidNet + endingCpNet + noticeCompensationNet + precariousnessNet + regularizationNet + otherSalaryNet;
  const netSalary = Math.max(0, salaryBeforeDeduction - deduction);

  const normalGross = basis.normalHoursExact * grossRate;
  const contractMajorGross = basis.majorHoursExact * grossRate * majorFactor;
  const complementaryGross = complementaryHours * grossRate * complementaryFactor;
  const extraMajorGross = extraMajorHours * grossRate * majorFactor;
  const estimatedGross = grossRate > 0
    ? Math.max(0, normalGross + contractMajorGross + complementaryGross + extraMajorGross)
    : 0;
  const officialGross = Math.max(0, number(input.officialGross));

  const maintenanceCalculation = calculateMaintenanceAllowance(contract, input);
  const maintenance = maintenanceCalculation.total;
  const meals = Math.max(0, number(input.meals)) * Math.max(0, number(contract.mealRate)) +
    Math.max(0, number(input.partialMeals)) * Math.max(0, number(contract.partialMealRate));
  const kilometers = Math.max(0, number(input.kilometerAllowance));
  const advancePaid = Math.max(0, number(input.advancePaid));
  const accrualWeeks = input.autoLeaveAccrual === false
    ? Math.max(0, number(input.equivalentWeeks))
    : number(contract.weeksPerYear) <= 46 && input.actualDays != null && number(contract.daysPerWeek) > 0
      ? Math.max(
          0,
          number(input.actualDays) / number(contract.daysPerWeek) +
            number(input.leaveAdjustmentWeeks)
        )
      : automaticAccrualWeeks(
          contract,
          input.period,
          input.isEndContract === "yes" ? input.endDate : "",
          input.leaveAdjustmentWeeks
        );
  const acquiredRaw = accrualWeeks * 2.5 / 4;
  const cpHours = netRate > 0 ? (cpPaidNet + endingCpNet + noticeCompensationNet) / netRate : 0;
  const normalHoursWithPaidLeave = basis.normalHoursExact + cpHours + regularizationHours;
  const declaredDaysWithRegularization = input.isEndContract === "yes"
    ? Math.min(31, Math.ceil(basis.daysExact + regularizationDays - 1e-9))
    : basis.declaredDays;

  return {
    basis,
    declared: {
      days: declaredDaysWithRegularization,
      normalHours: Math.round(normalHoursWithPaidLeave),
      complementaryHours: round(complementaryHours, 2),
      majorHours: round(basis.declaredContractMajorHours + extraMajorHours, 2),
      cpDays: round(Math.max(0, number(input.cpDaysDeclared)) + Math.max(0, number(input.endingCpDays)), 2),
      netSalary: round(netSalary)
    },
    salary: {
      normalNet: round(normalNet),
      contractMajorNet: round(contractMajorNet),
      complementaryNet: round(complementaryNet),
      extraMajorNet: round(extraMajorNet),
      cpPaidNet: round(cpPaidNet),
      endingCpNet: round(endingCpNet),
      noticeCompensationNet: round(noticeCompensationNet),
      precariousnessNet: round(precariousnessNet),
      regularizationNet: round(regularizationNet),
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
      total: round(maintenance + meals + kilometers),
      maintenanceCalculation
    },
    advancePaid: round(advancePaid),
    totalToPay: round(Math.max(0, netSalary + maintenance + meals + kilometers + ruptureIndemnityNet - advancePaid)),
    paidLeaveConversion: {
      hours: round(cpHours, 4),
      normalHoursWithPaidLeave: round(normalHoursWithPaidLeave, 4)
    },
    regularizationConversion: {
      hours: round(regularizationHours, 4),
      days: round(regularizationDays, 4),
      daysBeforeCap: round(basis.daysExact + regularizationDays, 4),
      cappedAt31Days: basis.daysExact + regularizationDays > 31
    },
    additional: {
      specificHours: input.specificHours === "yes",
      over24Hours: input.over24Hours === "yes",
      disabilityCare: input.disabilityCare === "yes",
      endContract: input.isEndContract === "yes"
    },
    ending: {
      active: input.isEndContract === "yes",
      endDate: input.endDate || "",
      reason: input.endReason || "",
      precariousnessNet: round(precariousnessNet),
      cpCompensationNet: round(endingCpNet),
      cpDays: round(Math.max(0, number(input.endingCpDays)), 2),
      noticeCompensationNet: round(noticeCompensationNet),
      ruptureIndemnityNet: round(ruptureIndemnityNet),
      regularizationNet: round(regularizationNet),
      total: round(precariousnessNet + endingCpNet + noticeCompensationNet + ruptureIndemnityNet + regularizationNet)
    },
    leave: {
      acquiredRaw: round(acquiredRaw, 4),
      equivalentWeeks: round(accrualWeeks, 4),
      reference: referencePeriod(input.period)
    }
  };
}

const CMG_EFFORT_RATES = [0.000619, 0.000516, 0.000413, 0.000310, 0.000310, 0.000310, 0.000310, 0.000206];

export function calculateCmg(cmgProfile, declaration) {
  const annualResources = Math.max(0, number(cmgProfile.annualResourcesN2));
  const configured = annualResources > 0;
  const monthlyResources = configured
    ? Math.min(8500, Math.max(814.02, annualResources / 12))
    : 0;
  const children = Math.max(1, Math.round(number(cmgProfile.dependentChildren, 1)));
  const aeehShift = cmgProfile.aeeh === "yes" ? 1 : 0;
  const rateIndex = Math.min(CMG_EFFORT_RATES.length - 1, children - 1 + aeehShift);
  const effortRate = CMG_EFFORT_RATES[rateIndex];
  const declared = declaration.declared || {};
  const hours = Math.max(0,
    number(declared.normalHours) + number(declared.complementaryHours) + number(declared.majorHours)
  );
  const endingSalaryElements = number(declaration.ending?.precariousnessNet) +
    number(declaration.ending?.cpCompensationNet) +
    number(declaration.ending?.noticeCompensationNet) +
    number(declaration.ending?.regularizationNet);
  const eligibleCost = Math.max(0,
    number(declared.netSalary) - endingSalaryElements +
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
  const estimatedCmg = configured
    ? Math.max(0, Math.min(retainedCost, retainedCost - familyParticipation))
    : null;
  const chargedCost = declaration.totalToPay == null
    ? eligibleCost
    : Math.max(0, number(declaration.totalToPay));
  const estimatedOutOfPocket = configured
    ? Math.max(0, chargedCost - estimatedCmg)
    : null;

  return {
    configured,
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
    estimatedCmg: configured ? round(estimatedCmg) : null,
    estimatedOutOfPocket: configured ? round(estimatedOutOfPocket) : null,
    estimatedAidRate: configured && chargedCost > 0 ? round(estimatedCmg / chargedCost * 100, 1) : null,
    overCapCost: round(Math.max(0, eligibleCost - retainedCost))
  };
}

function recordPeriod(item) {
  return item?.input?.period || item?.period || "";
}

function recordAccrualWeeks(contract, period, record, untilDate) {
  if (record?.input?.autoLeaveAccrual === false) return Math.max(0, number(record.input.equivalentWeeks));
  if (record?.input?.autoLeaveAccrual == null && record?.input?.equivalentWeeks != null) {
    return Math.max(0, number(record.input.equivalentWeeks));
  }
  if (
    number(contract.weeksPerYear) <= 46 &&
    record?.input?.actualDays != null &&
    number(contract.daysPerWeek) > 0
  ) {
    return Math.max(
      0,
      number(record.input.actualDays) / number(contract.daysPerWeek) +
        number(record.input.leaveAdjustmentWeeks)
    );
  }
  return automaticAccrualWeeks(
    contract,
    period,
    period === untilDate.slice(0, 7) ? untilDate : "",
    record?.input?.leaveAdjustmentWeeks
  );
}

export function automaticLeaveLedger(contract, declarations, untilDate, draft = null) {
  const end = isoDate(untilDate);
  const start = isoDate(contract.startDate);
  if (!start || !end || end < start) {
    return { periods: {}, acquiredDays: 0, paidDays: 0, remainingDays: 0 };
  }
  const records = Object.values(declarations || {}).filter(item => recordPeriod(item) <= untilDate.slice(0, 7));
  const recordsByMonth = Object.fromEntries(records.map(item => [recordPeriod(item), item]));
  if (draft?.period && draft.period <= untilDate.slice(0, 7)) recordsByMonth[draft.period] = draft;
  const periods = {};
  let endingPayments = 0;

  for (const period of periodsBetween(contract.startDate, untilDate)) {
    const key = referencePeriod(period).key;
    const record = recordsByMonth[period];
    const weeks = recordAccrualWeeks(contract, period, record, untilDate);
    periods[key] ||= {
      key,
      label: referencePeriod(period).label,
      acquiredRaw: 0,
      annualDays: 0,
      childDays: 0,
      paidDays: 0,
      remainingDays: 0,
      closed: false,
      months: []
    };
    periods[key].acquiredRaw += weeks * 2.5 / 4;
    periods[key].months.push({ period, equivalentWeeks: round(weeks, 4), acquiredRaw: round(weeks * 2.5 / 4, 4) });
  }

  for (const record of Object.values(recordsByMonth)) {
    const period = recordPeriod(record);
    const paidKey = record.input?.cpReferenceKey || referencePeriod(period).key;
    periods[paidKey] ||= {
      key: paidKey,
      label: `1er juin ${paidKey} – 31 mai ${number(paidKey) + 1}`,
      acquiredRaw: 0,
      annualDays: 0,
      childDays: 0,
      paidDays: 0,
      remainingDays: 0,
      closed: true,
      months: []
    };
    periods[paidKey].paidDays += number(record.input?.cpDaysDeclared);
    endingPayments += number(record.input?.endingCpDays);
  }

  const dependentChildren = Math.max(0, Math.floor(number(contract.employeeDependentChildrenUnder15)));
  for (const [key, item] of Object.entries(periods)) {
    const closingDate = `${number(key) + 1}-05-31`;
    item.closed = end >= isoDate(closingDate);
    const cappedRaw = Math.min(30, item.acquiredRaw);
    item.annualDays = item.closed ? Math.min(30, Math.ceil(cappedRaw - 1e-9)) : cappedRaw;
    item.childDays = item.closed ? Math.min(dependentChildren * 2, Math.max(0, 30 - item.annualDays)) : 0;
    item.totalDays = Math.min(30, item.annualDays + item.childDays);
    item.remainingDays = Math.max(0, item.totalDays - item.paidDays);
  }

  for (const key of Object.keys(periods).sort()) {
    if (endingPayments <= 0) break;
    const item = periods[key];
    const allocated = Math.min(item.remainingDays, endingPayments);
    item.paidDays += allocated;
    item.remainingDays -= allocated;
    endingPayments -= allocated;
  }

  for (const item of Object.values(periods)) {
    for (const field of ["acquiredRaw", "annualDays", "childDays", "totalDays", "paidDays", "remainingDays"]) {
      item[field] = round(item[field], 2);
    }
  }

  const values = Object.values(periods);
  return {
    periods,
    acquiredDays: round(values.reduce((sum, item) => sum + item.totalDays, 0), 2),
    paidDays: round(values.reduce((sum, item) => sum + item.paidDays, 0), 2),
    remainingDays: round(values.reduce((sum, item) => sum + item.remainingDays, 0), 2)
  };
}

export function leaveSummary(contract, declarations, period, draft = null, untilDate = "") {
  const normalizedDate = untilDate || (() => {
    const [year, month] = period.split("-").map(Number);
    return `${period}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
  })();
  const ledger = automaticLeaveLedger(contract, declarations, normalizedDate, draft);
  const ref = referencePeriod(period);
  const current = ledger.periods[ref.key] || {
    acquiredRaw: 0, annualDays: 0, childDays: 0, totalDays: 0, paidDays: 0, remainingDays: 0, months: []
  };
  return {
    reference: ref,
    acquiredRaw: current.acquiredRaw,
    acquiredRoundedAtPeriodEnd: current.totalDays,
    annualDays: current.annualDays,
    childDays: current.childDays,
    paidDays: current.paidDays,
    remainingDays: current.remainingDays,
    monthAcquiredRaw: current.months.find(item => item.period === period)?.acquiredRaw || 0,
    monthEquivalentWeeks: current.months.find(item => item.period === period)?.equivalentWeeks || 0,
    ledger
  };
}

export function globalLeaveBalance(contract, declarations, untilDate = "", draft = null) {
  const ledger = automaticLeaveLedger(contract, declarations, untilDate, draft);
  return {
    ...ledger,
    acquiredByReference: Object.fromEntries(Object.entries(ledger.periods).map(([key, item]) => [key, item.totalDays])),
    paidByReference: Object.fromEntries(Object.entries(ledger.periods).map(([key, item]) => [key, item.paidDays]))
  };
}

export function calculateEnd(contract, declarations, input) {
  const endDate = input.endDate;
  const startDate = contract.startDate;
  const recordsByPeriod = Object.fromEntries(Object.values(declarations || {}).map(item => [recordPeriod(item), item]));
  const contractMonths = periodsBetween(startDate, endDate);
  const basis = contractBasis(contract);
  const grossRate = number(contract.grossHourlyRate) || estimatedGrossHourlyRate(contract.netHourlyRate);
  const estimatedMonthlyGross = basis.normalHoursExact * grossRate +
    basis.majorHoursExact * grossRate * (1 + number(contract.majorMarkup) / 100);
  const records = Object.values(recordsByPeriod).filter(item => {
    const period = recordPeriod(item);
    return period && (!endDate || `${period}-01` <= endDate);
  });
  const grossSalaryHistory = round(contractMonths.reduce((sum, period) => {
    const recordedGross = number(recordsByPeriod[period]?.results?.salary?.grossForHistory);
    return sum + (recordedGross || estimatedMonthlyGross);
  }, 0));
  const seniorityMonths = completedMonths(startDate, endDate);
  const reason = input.reason;
  const ruptureEligible = reason === "death" || (reason === "employer" && seniorityMonths >= 9);
  const grossToNetRatio = grossRate > 0
    ? Math.min(1, number(contract.netHourlyRate) / grossRate)
    : 1;
  const suggestedCddIndemnityGross = reason === "cdd" ? round(grossSalaryHistory * 0.10) : 0;
  const suggestedCddIndemnity = round(suggestedCddIndemnityGross * grossToNetRatio);
  const cddIndemnity = input.precariousnessNet === "" || input.precariousnessNet == null
    ? suggestedCddIndemnity
    : Math.max(0, number(input.precariousnessNet));
  const weeklyHours = number(contract.normalHoursPerWeek) + number(contract.majorHoursPerWeek);
  const weeklyNet = number(contract.normalHoursPerWeek) * number(contract.netHourlyRate) +
    number(contract.majorHoursPerWeek) * number(contract.netHourlyRate) * (1 + number(contract.majorMarkup) / 100);
  const automaticRegularizationDue = round(records.reduce((sum, record) => {
    const actualHours = number(record.input?.actualCareHours);
    const fallbackWeeks = number(contract.daysPerWeek) > 0
      ? number(record.input?.actualDays) / number(contract.daysPerWeek)
      : 0;
    const workedWeeks = actualHours > 0 && weeklyHours > 0 ? actualHours / weeklyHours : fallbackWeeks;
    return sum + workedWeeks * weeklyNet;
  }, 0));
  const automaticRegularizationPaid = round(records.reduce((sum, record) => {
    const salary = record.results?.salary || {};
    return sum + number(salary.normalNet) + number(salary.contractMajorNet) - number(salary.absenceDeductionNet);
  }, 0));
  const automaticRegularizationDays = round(Math.max(0, records.reduce((sum, record) =>
    sum + number(record.input?.actualDays) - basis.daysExact
  , 0)), 2);
  const regularizationDue = input.regularizationDueNet === "" || input.regularizationDueNet == null
    ? automaticRegularizationDue
    : number(input.regularizationDueNet);
  const regularizationPaid = input.regularizationPaidNet === "" || input.regularizationPaidNet == null
    ? automaticRegularizationPaid
    : number(input.regularizationPaidNet);
  const regularization = round(Math.max(0, regularizationDue - regularizationPaid));
  const automaticRegularizationHours = round(
    number(contract.netHourlyRate) > 0 ? regularization / number(contract.netHourlyRate) : 0,
    2
  );
  const leaveBalance = globalLeaveBalance(contract, declarations, endDate);
  const suggestedCpMaintenanceNet = round(leaveBalance.remainingDays / 6 * weeklyNet);
  const grossByReference = {};
  for (const period of contractMonths) {
    const key = referencePeriod(period).key;
    grossByReference[key] = number(grossByReference[key]) +
      (number(recordsByPeriod[period]?.results?.salary?.grossForHistory) || estimatedMonthlyGross);
  }
  const suggestedCpTenthGross = round(Object.entries(leaveBalance.periods).reduce((sum, [key, item]) => {
    const ratioUnpaid = item.totalDays > 0 ? item.remainingDays / item.totalDays : 0;
    return sum + number(grossByReference[key]) * 0.10 * ratioUnpaid;
  }, 0));
  const suggestedCpTenthNet = round(suggestedCpTenthGross * grossToNetRatio);
  const suggestedCpMaintenanceGross = round(grossToNetRatio > 0
    ? suggestedCpMaintenanceNet / grossToNetRatio
    : suggestedCpMaintenanceNet);
  const suggestedCpCompensation = Math.max(suggestedCpMaintenanceNet, suggestedCpTenthNet);
  const suggestedCpCompensationGross = suggestedCpMaintenanceNet >= suggestedCpTenthNet
    ? suggestedCpMaintenanceGross
    : suggestedCpTenthGross;
  const cpCompensation = input.endingCpNet === "" || input.endingCpNet == null
    ? suggestedCpCompensation
    : round(Math.max(0, number(input.endingCpNet)));
  const endingPeriod = endDate?.slice(0, 7);
  const endingRecord = recordsByPeriod[endingPeriod];
  const explicitEndingCpGross = number(endingRecord?.input?.endingCpGross);
  const cpCompensationGrossForRupture = round(
    explicitEndingCpGross ||
    ((input.endingCpNet !== "" && input.endingCpNet != null && grossToNetRatio > 0)
      ? cpCompensation / grossToNetRatio
      : suggestedCpCompensationGross)
  );
  const regularizationGrossForRupture = round(grossToNetRatio > 0 ? regularization / grossToNetRatio : regularization);
  const noticeCompensationNetForRupture = number(endingRecord?.results?.ending?.noticeCompensationNet);
  const noticeCompensationGrossForRupture = round(
    grossToNetRatio > 0 ? noticeCompensationNetForRupture / grossToNetRatio : noticeCompensationNetForRupture
  );
  const ruptureSalaryElementsGross = round(
    cpCompensationGrossForRupture +
    regularizationGrossForRupture +
    noticeCompensationGrossForRupture
  );
  const ruptureGrossBase = round(grossSalaryHistory + ruptureSalaryElementsGross);
  const suggestedRuptureIndemnity = ruptureEligible ? round(ruptureGrossBase / 80) : 0;
  const ruptureIndemnity = input.ruptureIndemnityNet === "" || input.ruptureIndemnityNet == null
    ? suggestedRuptureIndemnity
    : Math.max(0, number(input.ruptureIndemnityNet));
  const automaticLastSalary = endingRecord ? round(
    number(endingRecord.results?.totalToPay) -
    number(endingRecord.results?.ending?.total)
  ) : 0;
  const lastSalary = input.lastSalaryNet === "" || input.lastSalaryNet == null
    ? automaticLastSalary
    : round(Math.max(0, number(input.lastSalaryNet)));
  leaveBalance.projectedAcquiredDays = 0;
  leaveBalance.remainingWithProjection = leaveBalance.remainingDays;
  const total = round(ruptureIndemnity + cddIndemnity + regularization + cpCompensation + lastSalary);

  return {
    grossTotal: ruptureGrossBase,
    grossSalaryHistory,
    ruptureSalaryElementsGross,
    ruptureGrossBase,
    cpCompensationGrossForRupture,
    regularizationGrossForRupture,
    noticeCompensationGrossForRupture,
    seniorityMonths,
    ruptureEligible,
    ruptureIndemnity,
    cddIndemnity,
    suggestedRuptureIndemnity,
    suggestedCddIndemnity,
    suggestedCddIndemnityGross,
    regularization,
    cpCompensation,
    suggestedCpCompensation,
    suggestedCpCompensationGross,
    suggestedCpMaintenanceNet,
    suggestedCpMaintenanceGross,
    suggestedCpTenthNet,
    suggestedCpTenthGross,
    regularizationDue,
    regularizationPaid,
    automaticRegularizationDue,
    automaticRegularizationPaid,
    automaticRegularizationHours,
    automaticRegularizationDays,
    lastSalary,
    leaveBalance,
    total,
    grossMissing: records.some(item => !number(item.input?.officialGross)),
    grossEstimated: records.some(item => item.results?.salary?.grossSource !== "official"),
    recordsCount: records.length,
    estimatedMonthsCount: contractMonths.filter(period => !recordsByPeriod[period]).length
  };
}

export function defaultState() {
  return {
    version: DATA_VERSION,
    admin: {
      employerName: "",
      employerPajemploi: "",
      employerAddress: "",
      employerPhone: "",
      employerBirthDate: "",
      secondaryEmployerName: "",
      secondaryEmployerAddress: "",
      secondaryEmployerPhone: "",
      secondaryEmployerBirthDate: "",
      employeeName: "",
      employeeNumber: "",
      employeeAddress: "",
      employeeBirthDate: "",
      employeeBirthPlace: "",
      employeeBirthDepartment: "",
      employeeNationality: "france",
      employeeRetirementFund: "Régime unifié AGIRC-ARRCO",
      approvalNumber: "",
      childName: "Noa",
      childBirthDate: ""
    },
    contract: {
      startDate: "",
      contractType: "CDI",
      contractNumber: "00000",
      lastJobTitle: "Assistante maternelle agréée",
      weeksPerYear: 46,
      daysPerWeek: 5,
      normalHoursPerWeek: 40,
      majorHoursPerWeek: 0,
      netHourlyRate: 4,
      grossHourlyRate: 0,
      majorMarkup: 25,
      complementaryMarkup: 0,
      maintenanceRate: 0,
      mealRate: 4,
      partialMealRate: 0,
      employeeDependentChildrenUnder15: 0,
      cpPaymentMode: "june",
      cpPaymentMonth: 6
    },
    cmgProfile: {
      annualResourcesN2: "",
      dependentChildren: 1,
      aeeh: "no"
    },
    preferences: {
      theme: "auto"
    },
    declarations: {}
  };
}

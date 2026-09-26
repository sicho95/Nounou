import test from "node:test";
import assert from "node:assert/strict";
import { calculateDeclaration } from "../core.mjs";
import { buildPajemploiGuide } from "../pajemploi-guide.mjs";

const contract = {
  startDate: "2026-01-01", weeksPerYear: 46, daysPerWeek: 5,
  normalHoursPerWeek: 40, majorHoursPerWeek: 2, netHourlyRate: 4.6,
  majorMarkup: 10, complementaryMarkup: 0, maintenanceRate: 3.8,
  mealRate: 5
};
const admin = { employeeName: "Salariée test", childName: "Enfant test" };

test("le mémo reproduit les cases saisies sans confondre virement et montant déclaré", () => {
  const input = { period: "2026-07", paymentDate: "2026-07-31", actualDays: 18, meals: 18 };
  const results = calculateDeclaration(contract, input);
  const sections = buildPajemploiGuide(admin, contract, input, results);
  const rows = sections.flatMap(section => section.rows);
  assert.equal(rows.find(row => row.label === "Salaire net du mois").value,
    results.declared.netSalary.toLocaleString("fr-FR", { style: "currency", currency: "EUR" }));
  assert.equal(rows.find(row => row.label === "Jours d’activité").value, String(results.declared.days));
  assert.equal(rows.find(row => row.label === "Fin de contrat ce mois ?").value, "Non");
  assert.ok(!rows.some(row => /CMG|virement|cotisations|prélèvement à la source/.test(row.label)));
});

test("les indemnités compensatrices restent dans les cases de fin, hors congés ordinaires et heures normales", () => {
  const input = {
    period: "2026-07", actualDays: 18, meals: 18, isEndContract: "yes",
    endDate: "2026-07-31", endingCpNet: 317.44, endingCpDays: 3,
    noticeCompensationNet: 25, ruptureIndemnityNet: 172.38
  };
  const results = calculateDeclaration(contract, input);
  const sections = buildPajemploiGuide(admin, contract, input, results);
  const rows = sections.flatMap(section => section.rows);
  assert.equal(rows.find(row => row.label === "Congés payés versés ce mois ?").value, "Non");
  assert.equal(rows.find(row => row.label === "Jours de congés payés").value, "0");
  assert.equal(rows.find(row => row.label === "Indemnité compensatrice de congés payés nette").value, "317,44 €");
  assert.equal(rows.find(row => row.label === "Indemnité compensatrice de préavis nette").value, "25,00 €");
  assert.equal(results.declared.normalHours, Math.round(results.basis.normalHoursExact));
});

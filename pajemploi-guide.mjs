import { money, number } from "./core.mjs";

const yesNo = value => value ? "Oui" : "Non";
const dateLabel = value => value
  ? new Date(`${value}T12:00:00`).toLocaleDateString("fr-FR")
  : "À renseigner";
const line = (label, value, note = "") => ({ label, value: String(value), note });

// Seules les cases que l'employeur saisit figurent ici. Le récapitulatif
// Pajemploi (cotisations, CMG, PAS et virement) reste distinct de ce mémo.
export function buildPajemploiGuide(admin, contract, input, results) {
  const { declared, expenses, ending, additional } = results;
  const periodStart = `${input.period}-01`;
  const periodEnd = new Date(Date.UTC(Number(input.period.slice(0, 4)), Number(input.period.slice(5, 7)), 0))
    .toISOString().slice(0, 10);
  const cpPaidThisMonth = number(input.cpPaidNet) > 0 || number(input.cpDaysDeclared) > 0;
  const sections = [
    {
      title: "Déclaration et travail",
      rows: [
        line("Salariée", admin.employeeName || "À renseigner dans Contrat"),
        line("Enfant accueilli", admin.childName || "À renseigner dans Contrat"),
        line("Période d’emploi", `${dateLabel(contract.startDate > periodStart ? contract.startDate : periodStart)} au ${dateLabel(ending.active && ending.endDate && ending.endDate < periodEnd ? ending.endDate : periodEnd)}`),
        line("Date de paiement du salaire", dateLabel(input.paymentDate)),
        line("Heures complémentaires ?", yesNo(declared.complementaryHours > 0)),
        line("Heures complémentaires", `${declared.complementaryHours} h`),
        line("Heures majorées ?", yesNo(declared.majorHours > 0)),
        line("Heures majorées", `${declared.majorHours} h`),
        line("Congés payés versés ce mois ?", yesNo(cpPaidThisMonth), "Hors indemnité compensatrice de fin de contrat."),
        ...(number(contract.weeksPerYear) <= 46 ? [line("Jours de congés payés", declared.cpDays)] : []),
        line("Jours d’activité", declared.days, "Jours mensualisés, avec régularisation éventuelle ; pas les jours réellement gardés."),
        line("Heures normales", `${declared.normalHours} h`, "Heures mensualisées, avec régularisation éventuelle.")
      ]
    },
    {
      title: "Rémunération et indemnités",
      rows: [
        line("Taux horaire net normal", money(contract.netHourlyRate)),
        line("Salaire net du mois", money(declared.netSalary), "Inclut la régularisation de salaire si le contrat se termine ; hors indemnités de fin et frais."),
        line("Indemnité d’entretien ?", yesNo(expenses.maintenance > 0)),
        line("Indemnité d’entretien", money(expenses.maintenance)),
        line("Indemnités de repas ?", yesNo(expenses.meals > 0)),
        line("Indemnités de repas", money(expenses.meals)),
        line("Indemnités kilométriques ?", yesNo(expenses.kilometers > 0)),
        line("Indemnités kilométriques", money(expenses.kilometers)),
        line("Acompte versé ?", yesNo(results.advancePaid > 0)),
        line("Montant de l’acompte", money(results.advancePaid))
      ]
    },
    {
      title: "Informations complémentaires",
      rows: [
        line("Heures spécifiques ?", yesNo(additional.specificHours)),
        line("Garde de plus de 24 h consécutives ?", yesNo(additional.over24Hours)),
        line("Enfant en situation de handicap, longue maladie ou inadapté ?", yesNo(additional.disabilityCare)),
        line("Fin de contrat ce mois ?", yesNo(ending.active))
      ]
    }
  ];
  if (ending.active) sections.push({
    title: "Indemnités de fin de contrat",
    rows: [
      line("Date de fin de contrat", dateLabel(ending.endDate)),
      line("Enfant concerné", admin.childName || "À renseigner dans Contrat"),
      line("Prime de précarité nette", money(ending.precariousnessNet)),
      line("Indemnité compensatrice de congés payés nette", money(ending.cpCompensationNet), `${ending.cpDays} jours soldés ; ne pas la ressaisir dans le salaire net ni les congés ordinaires.`),
      line("Indemnité compensatrice de préavis nette", money(ending.noticeCompensationNet)),
      line("Indemnité de rupture nette", money(ending.ruptureIndemnityNet))
    ]
  });
  return sections;
}

import { defaultState } from "./core.mjs";

const clone = value => globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));

export function contractSnapshot(state) {
  return clone({
    admin: state.admin,
    contract: state.contract,
    cmgProfile: state.cmgProfile,
    cmgProfiles: state.cmgProfiles,
    declarations: state.declarations
  });
}

export function ensurePortfolio(state, id = "contrat-initial") {
  state.activeContractId ||= id;
  state.contractWorkspaces ||= {};
  if (!state.contractWorkspaces[state.activeContractId]) {
    state.contractWorkspaces[state.activeContractId] = contractSnapshot(state);
  }
  return state;
}

export function syncActiveContract(state) {
  ensurePortfolio(state);
  state.contractWorkspaces[state.activeContractId] = contractSnapshot(state);
  return state;
}

export function switchContract(state, id) {
  syncActiveContract(state);
  const selected = state.contractWorkspaces[id];
  if (!selected) throw new Error("Contrat introuvable");
  state.activeContractId = id;
  Object.assign(state, clone(selected));
  return state;
}

export function createContract(state, id) {
  syncActiveContract(state);
  if (!id || state.contractWorkspaces[id]) throw new Error("Identifiant de contrat déjà utilisé");
  const fresh = defaultState();
  const retained = [
    "employerName", "employerPajemploi", "employerAddress", "employerPhone", "employerBirthDate",
    "secondaryEmployerName", "secondaryEmployerAddress", "secondaryEmployerPhone", "secondaryEmployerBirthDate",
    "childName", "childBirthDate"
  ];
  for (const key of retained) fresh.admin[key] = state.admin[key] || fresh.admin[key];
  fresh.cmgProfile = clone(state.cmgProfile);
  fresh.cmgProfiles = clone(state.cmgProfiles);
  state.contractWorkspaces[id] = contractSnapshot(fresh);
  return switchContract(state, id);
}

export function contractLabel(snapshot) {
  const name = snapshot.admin?.employeeName?.trim() || "Nouvelle nounou";
  const date = snapshot.contract?.startDate || "date à préciser";
  return `${name} · ${date}`;
}

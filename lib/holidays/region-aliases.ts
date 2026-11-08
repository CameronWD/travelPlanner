export function normRegion(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
}

const ALIASES: Record<string, Record<string, string[]>> = {
  de: {
    Bavaria: ["Bayern"],
    Hesse: ["Hessen"],
    "Lower Saxony": ["Niedersachsen"],
    "Mecklenburg-Western Pomerania": ["Mecklenburg-Vorpommern"],
    "North Rhine-Westphalia": ["Nordrhein-Westfalen"],
    "Rhineland-Palatinate": ["Rheinland-Pfalz"],
    Saxony: ["Sachsen"],
    "Saxony-Anhalt": ["Sachsen-Anhalt"],
    Thuringia: ["Thüringen"],
  },
  ch: {
    Geneva: ["Genf", "Genève", "Ginevra"],
    Lucerne: ["Luzern", "Lucerna"],
    "Basel-Land": ["Basel-Landschaft", "Bâle-Campagne", "Basilea Campagna"],
    "Basel-Stadt": ["Bâle-Ville", "Basilea Città"],
    "St. Gallen": ["Sankt Gallen", "Saint-Gall", "San Gallo"],
    Valais: ["Wallis", "Vallese"],
    Ticino: ["Tessin"],
    Vaud: ["Waadt"],
    Fribourg: ["Freiburg", "Friburgo"],
    Neuchâtel: ["Neuenburg"],
    Graubünden: ["Grisons", "Grigioni"],
    Bern: ["Berne", "Berna"],
    Zurich: ["Zurigo"],
    Aargau: ["Argovie", "Argovia"],
    Thurgau: ["Thurgovie", "Turgovia"],
    Solothurn: ["Soleure", "Soletta"],
    Schaffhausen: ["Schaffhouse", "Sciaffusa"],
    Glarus: ["Glaris", "Glarona"],
    Zug: ["Zoug", "Zugo"],
    Schwyz: ["Schwytz", "Svitto"],
  },
  my: {
    Malacca: ["Melaka"],
    Penang: ["Pulau Pinang"],
  },
};

const LOOKUP = new Map<string, Map<string, string>>(
  Object.entries(ALIASES).map(([cc, byFeed]) => [
    cc,
    new Map(Object.entries(byFeed).flatMap(([feed, locals]) => locals.map((l) => [normRegion(l), feed] as const))),
  ]),
);

function stripRules(region: string): string {
  return region
    .replace(/^(canton of |federal territory of |wilayah persekutuan )/i, "")
    .replace(/\s+darul\b.*$/i, "")
    .trim();
}

export function canonicalRegion(countryCode: string, region: string): string {
  const stripped = stripRules(region);
  return LOOKUP.get(countryCode.toLowerCase())?.get(normRegion(stripped)) ?? stripped;
}

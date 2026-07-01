/**
 * Mapping codice nazione → emoji bandiera + nome
 * Copertura: paesi principali del trotto internazionale
 */

export const COUNTRY_FLAG: Record<string, string> = {
  ITA: "🇮🇹",
  FRA: "🇫🇷",
  USA: "🇺🇸",
  SWE: "🇸🇪",
  NOR: "🇳🇴",
  DEN: "🇩🇰",
  FIN: "🇫🇮",
  GER: "🇩🇪",
  AUS: "🇦🇺",
  NZL: "🇳🇿",
  CAN: "🇨🇦",
  NED: "🇳🇱",
  BEL: "🇧🇪",
  SUI: "🇨🇭",
  AUT: "🇦🇹",
  RUS: "🇷🇺",
  UKR: "🇺🇦",
  HUN: "🇭🇺",
  POL: "🇵🇱",
  CZE: "🇨🇿",
  SLO: "🇸🇮",
  CRO: "🇭🇷",
  SER: "🇷🇸",
  ROM: "🇷🇴",
  GBR: "🇬🇧",
  IRE: "🇮🇪",
  ESP: "🇪🇸",
  POR: "🇵🇹",
  // Trottoweb codes
  I:   "🇮🇹",
  F:   "🇫🇷",
  A:   "🇺🇸",  // America (USA)
  S:   "🇸🇪",  // Svezia
  N:   "🇳🇴",  // Norvegia
  D:   "🇩🇰",  // Danimarca
  SF:  "🇫🇮",  // Finlandia
  G:   "🇩🇪",  // Germania
};

export const COUNTRY_NAME: Record<string, string> = {
  ITA: "Italia", FRA: "Francia", USA: "USA", SWE: "Svezia",
  NOR: "Norvegia", DEN: "Danimarca", FIN: "Finlandia", GER: "Germania",
  AUS: "Australia", NZL: "Nuova Zelanda", CAN: "Canada",
  NED: "Paesi Bassi", BEL: "Belgio", GBR: "Gran Bretagna", IRE: "Irlanda",
  I: "Italia", F: "Francia", A: "USA", S: "Svezia", N: "Norvegia",
  D: "Danimarca", SF: "Finlandia", G: "Germania",
};

/**
 * Stalloni internazionali noti con la loro nazionalità.
 * Usato come fallback quando il DB non ha il campo nationality.
 */
export const KNOWN_STALLION_NATIONALITY: Record<string, string> = {
  "VARENNE":           "ITA",
  "FACE TIME BOURBON": "FRA",
  "MAHARAJAH":         "SWE",
  "NAD AL SHEBA":      "SWE",
  "LOVE YOU":          "FRA",
  "READY CASH":        "FRA",
  "MUSCLE HILL":       "USA",
  "MUSCLE MASS":       "USA",
  "VIKING KRONOS":     "ITA",
  "TIMOKO":            "FRA",
  "COKTAIL JET":       "FRA",
  "CONWAY HALL":       "USA",
  "OROPURO BAR":       "ITA",
  "FILIPP ROC":        "ITA",
  "WISHING STONE":     "USA",
  "PINE CHIP":         "USA",
  "DONATO HANOVER":    "USA",
  "FATHER PATRICK":    "USA",
  "SJ'S PHOTO":        "USA",
  "GANYMEDE":          "ITA",
  "INDY DE VIVE":      "FRA",
  "AMERICAN WINNER":   "USA",
  "SPEEDY SOMOLLI":    "USA",
  "WAIKIKI BEACH":     "USA",
  "MUSCLES YANKEE":    "USA",
  "QUOUKY WILLIAMS":   "FRA",
  "GARLAND LOBELL":    "USA",
  "SUPER BOWL":        "USA",
  "GIANT CHILL":       "SWE",
  "WINDSONG'S LEGACY": "USA",
  "AND ARIFANT":       "FRA",
  "IMOKO":             "FRA",
  "EXTREME DREAM":     "FRA",
  "GIS DELL'OLMO":     "ITA",
  "INCREDIBLE RUN":    "ITA",
};

export function getFlag(nationality?: string | null, name?: string): string {
  if (!nationality && name) {
    const nat = KNOWN_STALLION_NATIONALITY[name?.toUpperCase()];
    if (nat) return COUNTRY_FLAG[nat] ?? "";
  }
  if (!nationality) return "🇮🇹"; // default Italia
  return COUNTRY_FLAG[nationality.toUpperCase()] ?? "";
}

export function getNationality(nationality?: string | null, name?: string): string {
  if (!nationality && name) {
    const nat = KNOWN_STALLION_NATIONALITY[name?.toUpperCase()];
    if (nat) return nat;
  }
  return nationality?.toUpperCase() ?? "ITA";
}

import imageIndex from "../data/vehicle-images.json";
import bodyTypes from "../data/vehicle-body-types.json";

export type VehicleBodyType =
  | "sedan" | "suv" | "hatchback" | "coupe" | "convertible"
  | "wagon" | "pickup" | "minivan" | "van";

export interface VehicleImageInput {
  make: string;
  model: string;
  year?: number | null;
  bodyType?: string | null;
}

export interface VehicleImageMatch {
  src: string;
  matchType: "model" | "bodyType";
  bodyType?: VehicleBodyType;
}

interface ImageRecord {
  brand: string;
  model: string | null;
  modelSlug: string;
  bodyType?: VehicleBodyType;
  img: string;
}

const records = imageIndex as ImageRecord[];
const bodyTypeMap = bodyTypes as Record<string, Record<string, VehicleBodyType>>;
const bodyTypesSet = new Set<VehicleBodyType>([
  "sedan", "suv", "hatchback", "coupe", "convertible", "wagon", "pickup", "minivan", "van",
]);

function normalize(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim().replace(/\s+/g, " ");
}

const makeAliases: Record<string, string> = {
  vw: "volkswagen", mercedes: "mercedes-benz", "mercedes benz": "mercedes-benz",
  benz: "mercedes-benz", skoda: "skoda", "land rover": "land rover", chevy: "chevrolet",
};

function canonicalMake(make: string): string {
  const normalized = normalize(make);
  const alias = makeAliases[normalized] ?? normalized;
  return alias.replace(/ /g, "-");
}

function canonicalModel(model: string): string {
  return normalize(model);
}

function canonicalBodyType(bodyType?: string | null): VehicleBodyType | null {
  if (!bodyType) return null;
  const normalized = normalize(bodyType).replace(/ /g, "") as VehicleBodyType;
  return bodyTypesSet.has(normalized) ? normalized : null;
}

function modelBodyType(brand: string, model: string): VehicleBodyType | null {
  const mapping = bodyTypeMap[brand];
  if (!mapping) return null;
  const normalized = canonicalModel(model);
  const direct = Object.entries(mapping).find(([knownModel]) => canonicalModel(knownModel) === normalized);
  if (direct) return direct[1];
  // Some listings append a trim or engine after a complete, known model name.
  const prefixes = Object.entries(mapping).filter(([knownModel]) => {
    const known = canonicalModel(knownModel);
    return known.length >= 4 && normalized.startsWith(`${known} `);
  });
  prefixes.sort(([a], [b]) => canonicalModel(b).length - canonicalModel(a).length);
  return prefixes[0]?.[1] ?? null;
}

export function resolveVehicleImage(vehicle: VehicleImageInput): VehicleImageMatch | null {
  const brand = canonicalMake(vehicle.make);
  const model = canonicalModel(vehicle.model);
  if (!brand) return null;

  if (model) {
    const exact = records.find((record) => record.brand === brand && record.model !== null && canonicalModel(record.model) === model);
    if (exact) return { src: `/vehicles/${exact.img.replace(/^images\//, "")}`, matchType: "model" };
  }

  const bodyType = canonicalBodyType(vehicle.bodyType) ?? (model ? modelBodyType(brand, vehicle.model) : null);
  if (!bodyType) return null;
  const generic = records.find((record) => record.brand === brand && record.model === null && record.bodyType === bodyType);
  return generic ? {
    src: `/vehicles/${generic.img.replace(/^images\//, "")}`,
    matchType: "bodyType",
    bodyType,
  } : null;
}

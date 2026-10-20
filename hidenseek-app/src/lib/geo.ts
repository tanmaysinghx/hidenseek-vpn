import { geoArea, geoCentroid } from "d3-geo";
import countryCodes from "i18n-iso-countries";
import { feature } from "topojson-client";
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon } from "geojson";
import type { GeometryCollection, Topology } from "topojson-specification";
import world from "world-atlas/countries-110m.json";
import { api } from "./ipc";
import type { Server } from "./types";

/** [longitude, latitude] */
export type LonLat = [number, number];

export interface Place {
  city: string | null;
  countryCode: string;
  coords: LonLat;
}

/** What the map shows as "you". `source` says how sure we are. */
export interface MyLocation extends Place {
  ip: string | null;
  source: "manual" | "network" | "timezone";
}

type CountryProps = { name: string };
export type CountryFeature = Feature<Polygon | MultiPolygon, CountryProps>;

const topology = world as unknown as Topology<{ countries: GeometryCollection<CountryProps> }>;

/** Country shapes (Natural Earth 1:110m), without Antarctica. */
export const COUNTRIES: CountryFeature[] = (
  feature(topology, topology.objects.countries) as FeatureCollection<Geometry, CountryProps>
).features.filter((f): f is CountryFeature => f.id !== "010" && (f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon"));

/**
 * Cities the map can place exactly: likely VPS locations and large cities people connect from.
 * Anything else falls back to the middle of its country.
 */
const CITIES: [string, string, number, number][] = [
  // India
  ["Lucknow", "IN", 80.95, 26.85], ["Delhi", "IN", 77.21, 28.61], ["New Delhi", "IN", 77.21, 28.61], ["Noida", "IN", 77.33, 28.54],
  ["Gurugram", "IN", 77.03, 28.46], ["Gurgaon", "IN", 77.03, 28.46], ["Mumbai", "IN", 72.88, 19.08], ["Pune", "IN", 73.86, 18.52],
  ["Bengaluru", "IN", 77.59, 12.97], ["Bangalore", "IN", 77.59, 12.97], ["Chennai", "IN", 80.27, 13.08], ["Hyderabad", "IN", 78.49, 17.39],
  ["Kolkata", "IN", 88.36, 22.57], ["Ahmedabad", "IN", 72.57, 23.02], ["Jaipur", "IN", 75.79, 26.91], ["Kanpur", "IN", 80.33, 26.45],
  ["Varanasi", "IN", 82.97, 25.32], ["Prayagraj", "IN", 81.85, 25.44], ["Agra", "IN", 78.01, 27.18], ["Patna", "IN", 85.14, 25.59],
  ["Bhopal", "IN", 77.41, 23.26], ["Indore", "IN", 75.86, 22.72], ["Chandigarh", "IN", 76.78, 30.73], ["Kochi", "IN", 76.27, 9.93],
  ["Thiruvananthapuram", "IN", 76.94, 8.52], ["Nagpur", "IN", 79.09, 21.15], ["Surat", "IN", 72.83, 21.17], ["Dehradun", "IN", 78.03, 30.32],
  ["Guwahati", "IN", 91.74, 26.14], ["Bhubaneswar", "IN", 85.82, 20.30], ["Visakhapatnam", "IN", 83.22, 17.69], ["Coimbatore", "IN", 76.96, 11.02],
  // Asia and Oceania
  ["Singapore", "SG", 103.82, 1.35], ["Tokyo", "JP", 139.69, 35.68], ["Osaka", "JP", 135.50, 34.69], ["Seoul", "KR", 126.98, 37.57],
  ["Hong Kong", "HK", 114.17, 22.32], ["Taipei", "TW", 121.56, 25.03], ["Shanghai", "CN", 121.47, 31.23], ["Beijing", "CN", 116.41, 39.90],
  ["Bangkok", "TH", 100.50, 13.76], ["Kuala Lumpur", "MY", 101.69, 3.14], ["Jakarta", "ID", 106.85, -6.21], ["Manila", "PH", 120.98, 14.60],
  ["Ho Chi Minh City", "VN", 106.63, 10.82], ["Hanoi", "VN", 105.85, 21.03], ["Dhaka", "BD", 90.41, 23.81], ["Karachi", "PK", 67.01, 24.86],
  ["Lahore", "PK", 74.36, 31.55], ["Kathmandu", "NP", 85.32, 27.72], ["Colombo", "LK", 79.86, 6.93], ["Dubai", "AE", 55.27, 25.20],
  ["Abu Dhabi", "AE", 54.37, 24.45], ["Riyadh", "SA", 46.68, 24.71], ["Doha", "QA", 51.53, 25.29], ["Tel Aviv", "IL", 34.78, 32.09],
  ["Istanbul", "TR", 28.98, 41.01], ["Sydney", "AU", 151.21, -33.87], ["Melbourne", "AU", 144.96, -37.81], ["Perth", "AU", 115.86, -31.95],
  ["Auckland", "NZ", 174.76, -36.85],
  // Europe
  ["London", "GB", -0.13, 51.51], ["Manchester", "GB", -2.24, 53.48], ["Dublin", "IE", -6.26, 53.35], ["Amsterdam", "NL", 4.90, 52.37],
  ["Frankfurt", "DE", 8.68, 50.11], ["Berlin", "DE", 13.40, 52.52], ["Munich", "DE", 11.58, 48.14], ["Nuremberg", "DE", 11.08, 49.45],
  ["Falkenstein", "DE", 12.37, 50.48], ["Paris", "FR", 2.35, 48.86], ["Marseille", "FR", 5.37, 43.30], ["Brussels", "BE", 4.35, 50.85],
  ["Zurich", "CH", 8.54, 47.38], ["Geneva", "CH", 6.14, 46.20], ["Vienna", "AT", 16.37, 48.21], ["Milan", "IT", 9.19, 45.46],
  ["Rome", "IT", 12.50, 41.90], ["Madrid", "ES", -3.70, 40.42], ["Barcelona", "ES", 2.17, 41.39], ["Lisbon", "PT", -9.14, 38.72],
  ["Stockholm", "SE", 18.07, 59.33], ["Oslo", "NO", 10.75, 59.91], ["Copenhagen", "DK", 12.57, 55.68], ["Helsinki", "FI", 24.94, 60.17],
  ["Warsaw", "PL", 21.01, 52.23], ["Prague", "CZ", 14.44, 50.08], ["Budapest", "HU", 19.04, 47.50], ["Bucharest", "RO", 26.10, 44.43],
  ["Sofia", "BG", 23.32, 42.70], ["Athens", "GR", 23.73, 37.98], ["Kyiv", "UA", 30.52, 50.45], ["Moscow", "RU", 37.62, 55.76],
  ["Reykjavik", "IS", -21.94, 64.15], ["Luxembourg", "LU", 6.13, 49.61], ["Tallinn", "EE", 24.75, 59.44],
  // Americas
  ["New York", "US", -74.01, 40.71], ["Ashburn", "US", -77.49, 39.04], ["Washington", "US", -77.04, 38.91], ["Chicago", "US", -87.63, 41.88],
  ["Dallas", "US", -96.80, 32.78], ["Atlanta", "US", -84.39, 33.75], ["Miami", "US", -80.19, 25.76], ["Los Angeles", "US", -118.24, 34.05],
  ["San Francisco", "US", -122.42, 37.77], ["San Jose", "US", -121.89, 37.34], ["Seattle", "US", -122.33, 47.61], ["Hillsboro", "US", -122.99, 45.52],
  ["Denver", "US", -104.99, 39.74], ["Phoenix", "US", -112.07, 33.45], ["Boston", "US", -71.06, 42.36], ["Toronto", "CA", -79.38, 43.65],
  ["Montreal", "CA", -73.57, 45.50], ["Vancouver", "CA", -123.12, 49.28], ["Mexico City", "MX", -99.13, 19.43], ["Sao Paulo", "BR", -46.63, -23.55],
  ["São Paulo", "BR", -46.63, -23.55], ["Rio de Janeiro", "BR", -43.17, -22.91], ["Buenos Aires", "AR", -58.38, -34.60], ["Santiago", "CL", -70.67, -33.45],
  ["Bogota", "CO", -74.07, 4.71], ["Lima", "PE", -77.04, -12.05],
  // Africa
  ["Johannesburg", "ZA", 28.05, -26.20], ["Cape Town", "ZA", 18.42, -33.92], ["Lagos", "NG", 3.38, 6.52], ["Nairobi", "KE", 36.82, -1.29],
  ["Cairo", "EG", 31.24, 30.04], ["Casablanca", "MA", -7.59, 33.57],
];

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
const cityIndex = new Map(CITIES.map(([name, cc, lon, lat]) => [`${norm(name)}|${cc}`, [lon, lat] as LonLat]));

/** Cities a person can pick as their own location, one entry per place. */
export const PICKABLE_CITIES: Place[] = CITIES.filter(
  ([name], i) => !["New Delhi", "Gurgaon", "Bangalore", "São Paulo"].includes(name) && i === CITIES.findIndex((c) => c[0] === name),
).map(([city, countryCode, lon, lat]) => ({ city, countryCode, coords: [lon, lat] }));

const centroids = new Map<string, LonLat>();

/** Middle of a country's largest landmass, so France lands in France and not in the Atlantic. */
export function countryCentroid(code: string): LonLat | null {
  const cc = code.toUpperCase();
  if (centroids.has(cc)) return centroids.get(cc)!;
  const numeric = countryCodes.alpha2ToNumeric(cc);
  const shape = numeric && COUNTRIES.find((f) => f.id === numeric);
  if (!shape) return null;
  const polygons = shape.geometry.type === "Polygon" ? [shape.geometry.coordinates] : shape.geometry.coordinates;
  const largest = polygons
    .map((coordinates) => ({ type: "Polygon" as const, coordinates }))
    .reduce((a, b) => (geoArea(b) > geoArea(a) ? b : a));
  const c = geoCentroid(largest) as LonLat;
  centroids.set(cc, c);
  return c;
}

export function placeOf(city: string | null | undefined, countryCode: string | null | undefined): LonLat | null {
  if (!countryCode) return null;
  const cc = countryCode.toUpperCase();
  return (city && cityIndex.get(`${norm(city)}|${cc}`)) || countryCentroid(cc);
}

export function serverCoords(server: Pick<Server, "city" | "countryCode">): LonLat | null {
  return placeOf(server.city, server.countryCode);
}

/** Great-circle distance in km. */
export function distanceKm([lon1, lat1]: LonLat, [lon2, lat2]: LonLat): number {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

// ---- Where "you" are ---------------------------------------------------------------------------

const MANUAL_KEY = "hidenseek.myLocation";
const DETECTED_KEY = "hidenseek.detectedLocation";

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: the location just isn't remembered.
  }
}

export function manualLocation(): Place | null {
  return read<Place>(MANUAL_KEY);
}

export function setManualLocation(place: Place | null) {
  write(MANUAL_KEY, place);
  window.dispatchEvent(new Event("hidenseek:location"));
}

/** Rough guess from the clock's timezone, e.g. Asia/Kolkata → India. Only the country is trusted. */
function fromTimezone(): MyLocation | null {
  let zone = "";
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    return null;
  }
  const city = zone.split("/").pop()?.replace(/_/g, " ");
  const match = city && CITIES.find(([name]) => norm(name) === norm(city));
  const cc = match ? match[1] : zone === "Asia/Calcutta" ? "IN" : null;
  if (!cc) return null;
  const coords = countryCentroid(cc) ?? (match ? ([match[2], match[3]] as LonLat) : null);
  return coords ? { city: null, countryCode: cc, coords, ip: null, source: "timezone" } : null;
}

interface Detected {
  ip: string;
  countryCode: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
}

/**
 * Resolves the person's location: a city they picked in Settings, else what the backend's GeoIP
 * says about their IP (only asked while disconnected, since the tunnel would report the server),
 * else a timezone guess.
 */
export async function resolveMyLocation(connected: boolean): Promise<MyLocation | null> {
  const manual = manualLocation();
  let detected = read<Detected>(DETECTED_KEY);
  if (!connected) {
    try {
      detected = await api.get<Detected>("/api/v1/me/location");
      write(DETECTED_KEY, detected);
    } catch {
      // Older backend or offline: keep the last answer.
    }
  }
  if (manual) return { ...manual, ip: detected?.ip ?? null, source: "manual" };
  if (detected?.countryCode) {
    const coords: LonLat | null =
      detected.longitude != null && detected.latitude != null
        ? [detected.longitude, detected.latitude]
        : placeOf(detected.city, detected.countryCode);
    if (coords) return { city: detected.city, countryCode: detected.countryCode, coords, ip: detected.ip, source: "network" };
  }
  const guess = fromTimezone();
  return guess ? { ...guess, ip: detected?.ip ?? null } : null;
}

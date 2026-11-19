import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "../src/lib/supabase";
import { cellOf, findClinics, geocode, isClinic, memoryCache, weekHours } from "../supabase/functions/find-clinics/clinics.js";
import { directionsUrl, distanceKm, is24h, kmText, locate, openState, searchClinics, telUrl } from "../src/lib/clinics";

/* TomTom is replaced by a fake fetch, so these tests use none of the free monthly searches. */
const KEY = "test-key";
const place = (id, title, lon, lat, o = {}) => ({
  id, title, position: { type: "Point", coordinates: [lon, lat] },
  address: { street: "P. Herrera Street", municipalitySubdivision: "Barangay 6", municipality: "Batangas City" },
  contacts: [{ type: "default", phones: ["+63 43 984 1404"] }], ...o,
});
const hours = (start, end) => [
  { date: "2026-11-01", timeRanges: [] },   // Sunday closed
  ...["02", "03", "04", "05", "06", "07"].map((d) => ({ date: `2026-11-${d}`, timeRanges: [{ start, end, utcOffsetSeconds: 28800 }] })),
];
const tomtom = (results) => vi.fn(async () => ({ ok: true, json: async () => ({ results }) }));

beforeEach(() => supabase.reset());
afterEach(() => vi.unstubAllGlobals());

describe("UC7 Locate Veterinary Clinic", () => {
  it("[FR7.1] A search near a location asks TomTom for veterinarians within 10 km, with the key in a header, not the URL", async () => {
    const fetch = tomtom([1, 2, 3, 4, 5].map((i) => place(`c${i}`, `Clinic ${i} Veterinary Clinic`, 121.06 + i / 1000, 13.76)));
    vi.stubGlobal("fetch", fetch);
    const r = await findClinics({ lat: 13.7565, lon: 121.0583 }, { key: KEY, cache: memoryCache() });
    const [url, init] = fetch.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(url).toBe("https://api.tomtom.com/maps/orbis/places/discover");
    expect(url).not.toContain(KEY);
    expect(init.headers["TomTom-Api-Key"]).toBe(KEY);
    expect(body.filters).toMatchObject({ poiTypes: ["veterinary"], geometry: { type: "circle", center: [121.06, 13.76], radiusInMeters: 10000 } });
    expect(r).toMatchObject({ radius: 10000, cached: false, source: "TomTom" });
    expect(r.clinics).toHaveLength(5);
  });

  it("[FR7.1] An address from Profile is turned into a location (Philippines only); an unknown address says so", async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ results: [{ position: { lat: 13.9439, lon: 121.1613 }, address: { freeformAddress: "Lipa City" } }] }) }));
    vi.stubGlobal("fetch", fetch);
    expect(await geocode("Lipa, Batangas", { key: KEY, cache: memoryCache() })).toEqual({ lat: 13.9439, lon: 121.1613, label: "Lipa City" });
    expect(fetch.mock.calls[0][0]).toContain(encodeURIComponent("Lipa, Batangas, Philippines"));
    expect(fetch.mock.calls[0][0]).toContain("countrySet=PH");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ results: [] }) })));
    expect(await geocode("Nowhere 123", { key: KEY, cache: memoryCache() })).toEqual({ notFound: true });
  });

  it("[FR7.1] The app sends the phone's location to the find-clinics function and shows its error messages", async () => {
    const invoke = vi.spyOn(supabase.functions, "invoke").mockResolvedValueOnce({ data: { clinics: [] }, error: null });
    expect(await searchClinics({ lat: 13.75, lon: 121.05 })).toEqual({ clinics: [] });
    expect(invoke).toHaveBeenCalledWith("find-clinics", { body: { lat: 13.75, lon: 121.05 } });
    invoke.mockResolvedValueOnce({ data: null, error: { message: "x", context: { json: async () => ({ error: "Please log in to find clinics." }) } } });
    await expect(searchClinics({ address: "Lipa" })).rejects.toThrow("Please log in to find clinics.");
  });

  it("[FR7.1] Offline, the search says to connect instead of failing silently", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await expect(searchClinics({ lat: 1, lon: 1 })).rejects.toThrow("You're offline. Connect to the internet to find clinics.");
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  it("[FR7.1] The phone's location is read once; if location is blocked, the owner is told how to fix it", async () => {
    const geo = { getCurrentPosition: vi.fn((ok) => ok({ coords: { latitude: 13.7565, longitude: 121.0583, accuracy: 20 } })) };
    Object.defineProperty(navigator, "geolocation", { value: geo, configurable: true });
    expect(await locate()).toEqual({ lat: 13.7565, lon: 121.0583, accuracy: 20 });
    geo.getCurrentPosition = vi.fn((ok, fail) => fail({ code: 1 }));
    await expect(locate()).rejects.toThrow("Location is blocked for FurFriends. Allow it in your browser's site settings, or use your address.");
  });

  it("[FR7.2] Animal-bite centers, health centers and supply stores are left out; clinics that also sell supplies stay", () => {
    expect(isClinic("Animal Bite Treatment Center")).toBe(false);
    expect(isClinic("Topmed Diagnostics & Animal Bite Center")).toBe(false);
    expect(isClinic("Npc Health Center")).toBe(false);
    expect(isClinic("Elite Enterprises Veterinary Supplies 2")).toBe(false);
    expect(isClinic("Ridecor Trading")).toBe(false);
    expect(isClinic("Cool Summer Farm")).toBe(false);
    expect(isClinic("EMG Animal Clinic & Veterinary Supply")).toBe(true);
    expect(isClinic("Serbisyo Beterinaryo Animal Hospital Emergency Vet 24hrs")).toBe(true);
    expect(isClinic("Vet Daddy Animal Clinic")).toBe(true);
  });

  it("[FR7.2] The same clinic listed twice nearby is shown once, keeping the listing with hours", async () => {
    vi.stubGlobal("fetch", tomtom([
      place("a", "Abys Veterinary Clinic", 121.06, 13.76),
      place("b", "Abys Veterinary Clinic", 121.0605, 13.7602, { openingHours: hours("08:00", "17:00") }),
      place("c", "Animal Bite Treatment Center", 121.07, 13.77),
      ...[1, 2, 3, 4].map((i) => place(`x${i}`, `Clinic ${i}`, 121.07 + i / 100, 13.77)),
    ]));
    const r = await findClinics({ lat: 13.76, lon: 121.06 }, { key: KEY, cache: memoryCache() });
    expect(r.clinics.map((c) => c.id)).toEqual(["b", "x1", "x2", "x3", "x4"]);
    expect(r.clinics[0]).toMatchObject({ name: "Abys Veterinary Clinic", phone: "+63 43 984 1404", address: "P. Herrera Street, Barangay 6, Batangas City" });
  });

  it("[FR7.3] Distances are worked out from the owner's location and shown in m or km", () => {
    expect(distanceKm({ lat: 13.76, lon: 121.06 }, { lat: 13.77, lon: 121.06 })).toBeCloseTo(1.112, 2);
    expect(kmText(0.384)).toBe("380 m");
    expect(kmText(1.84)).toBe("1.8 km");
    expect(kmText(12.4)).toBe("12 km");
  });

  it("[FR7.4] TomTom's dated hours become a weekly timetable; no hours means 'not listed'", () => {
    const week = weekHours(hours("08:00", "17:00"));
    expect(week[0]).toEqual([]);                    // Sunday: closed
    expect(week[4]).toEqual([["08:00", "17:00"]]);  // Thursday
    expect(weekHours(undefined)).toBeNull();
  });

  it("[FR7.4] Open now: at 10 AM Thursday a 8-5 clinic is open until 5; at 6 PM it opens 8 AM tomorrow; Saturday night it opens Monday", () => {
    const c = { hours: weekHours(hours("08:00", "17:00")), utcOffset: 28800 };
    const ph = (d, h) => new Date(Date.UTC(2026, 9, d, h - 8));   // Philippine time
    expect(openState(c, ph(29, 10))).toEqual({ open: true, text: "Open · closes 5:00 PM" });
    expect(openState(c, ph(29, 18))).toEqual({ open: false, text: "Closed · opens 8:00 AM tomorrow" });
    expect(openState(c, ph(31, 18))).toEqual({ open: false, text: "Closed · opens 8:00 AM Mon" });
    expect(openState(c, ph(29, 7))).toEqual({ open: false, text: "Closed · opens 8:00 AM" });
  });

  it("[FR7.4] A clinic open 00:00-23:59 every day shows 'Open 24 hours'; one without hours shows 'Hours not listed'", () => {
    const allDay = { hours: weekHours(Array.from({ length: 7 }, (_, i) => ({ date: `2026-11-0${i + 1}`, timeRanges: [{ start: "00:00", end: "23:59" }] }))) };
    expect(is24h(allDay)).toBe(true);
    expect(openState(allDay)).toEqual({ open: true, text: "Open 24 hours" });
    expect(openState({ hours: null })).toEqual({ open: null, text: "Hours not listed" });
  });

  it("[FR7.5] With fewer than 5 clinics within 10 km, the search widens to 25 km", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [place("a", "Only Vet Clinic", 121.0, 13.79)] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [1, 2, 3, 4, 5, 6].map((i) => place(`c${i}`, `Clinic ${i}`, 121 + i / 50, 13.79)) }) });
    vi.stubGlobal("fetch", fetch);
    const r = await findClinics({ lat: 13.79, lon: 121.0 }, { key: KEY, cache: memoryCache() });
    expect(fetch.mock.calls.map((c) => JSON.parse(c[1].body).filters.geometry.radiusInMeters)).toEqual([10000, 25000]);
    expect(r).toMatchObject({ radius: 25000 });
    expect(r.clinics).toHaveLength(6);
  });

  it("[FR7.5] Owners within the same ~1 km area share one saved search, so TomTom is asked only once", async () => {
    const fetch = tomtom([1, 2, 3, 4, 5].map((i) => place(`c${i}`, `Clinic ${i}`, 121.06, 13.76 + i / 1000)));
    vi.stubGlobal("fetch", fetch);
    const cache = memoryCache();
    await findClinics({ lat: 13.7565, lon: 121.0583 }, { key: KEY, cache });
    const again = await findClinics({ lat: 13.7581, lon: 121.0604 }, { key: KEY, cache });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(again.cached).toBe(true);
    expect(cellOf(13.7565, 121.0583)).toEqual({ lat: 13.76, lon: 121.06 });
  });
});

describe("UC8 Call / Navigate to Clinic", () => {
  it("[FR8.1] Directions open Google Maps with the clinic as the destination, starting from the phone's location", () => {
    expect(directionsUrl({ lat: 13.7601, lon: 121.0632 })).toBe("https://www.google.com/maps/dir/?api=1&destination=13.7601,121.0632");
  });

  it("[FR8.1] When searching from a saved address, directions start from that address", () => {
    expect(directionsUrl({ lat: 13.7601, lon: 121.0632 }, { lat: 13.9439, lon: 121.1613 }))
      .toBe("https://www.google.com/maps/dir/?api=1&destination=13.7601,121.0632&origin=13.9439,121.1613");
  });

  it("[FR8.2] Call dials the clinic's number with spaces and dashes removed", () => {
    expect(telUrl("+63 43 984 1404")).toBe("tel:+63439841404");
    expect(telUrl("(043) 723-5095")).toBe("tel:0437235095");
  });
});

import assert from "node:assert/strict";
import test from "node:test";
import { MARKETS, citiesFor, filterStations, marketFor, type DirectoryStation } from "./directory.ts";

const stations: DirectoryStation[] = [
  {
    id: "st-1",
    name: "Beat FM",
    country: "UG",
    region: "Central",
    city: "Kampala",
    frequency: "96.3 FM",
    languages: ["Luganda", "English"],
    genres: ["Music"],
    description: "Luganda music radio",
    operatingStatus: "on_air",
  },
  {
    id: "st-2",
    name: "Nile Wave",
    country: "UG",
    region: "Eastern",
    city: "Jinja",
    frequency: "96.1 FM",
    languages: ["Lusoga"],
    genres: ["Music", "News"],
    description: "Jinja's station",
    operatingStatus: "unknown",
  },
  {
    id: "st-3",
    name: "Nairobi Talk",
    country: "KE",
    region: "Nairobi",
    city: "Nairobi",
    frequency: null,
    languages: ["Swahili", "English"],
    genres: ["Talk"],
    description: "Kenyan talk radio",
    operatingStatus: "on_air",
  },
  {
    id: "st-4",
    name: "Suspended FM",
    country: "UG",
    region: "Central",
    city: "Kampala",
    frequency: null,
    languages: ["English"],
    genres: ["Talk"],
    description: "Currently off air",
    operatingStatus: "suspended",
  },
];

test("the directory is market-driven, not Uganda-hardcoded", () => {
  assert.ok(MARKETS.length >= 5);
  assert.equal(marketFor("KE").name, "Kenya");
  assert.ok(marketFor("UG").regions.includes("Central"));
  assert.equal(marketFor("UG").live, true);
});

test("filtering by country isolates a market", () => {
  const kenya = filterStations(stations, { country: "KE" });
  assert.deepEqual(kenya.map((s) => s.id), ["st-3"]);
});

test("filters compose across region, language and genre", () => {
  // st-4 is suspended, so it is excluded unless includeSuspended is set.
  assert.deepEqual(filterStations(stations, { country: "UG", region: "Central" }).map((s) => s.id), ["st-1"]);
  assert.deepEqual(filterStations(stations, { country: "UG", region: "Central", includeSuspended: true }).map((s) => s.id).sort(), ["st-1", "st-4"]);
  assert.deepEqual(filterStations(stations, { language: "Lusoga" }).map((s) => s.id), ["st-2"]);
  assert.deepEqual(filterStations(stations, { genre: "News" }).map((s) => s.id), ["st-2"]);
});

test("a text term searches name, city and description", () => {
  assert.deepEqual(filterStations(stations, { term: "jinja" }).map((s) => s.id), ["st-2"]);
  assert.deepEqual(filterStations(stations, { term: "96.1" }).map((s) => s.id), ["st-2"]);
});

test("suspended stations are hidden by default but remain reachable", () => {
  assert.ok(!filterStations(stations, {}).some((s) => s.id === "st-4"));
  assert.ok(filterStations(stations, { includeSuspended: true }).some((s) => s.id === "st-4"));
});

test("onlyVerified keeps stations that are actually on air", () => {
  assert.deepEqual(filterStations(stations, { onlyVerified: true, country: "UG" }).map((s) => s.id), ["st-1"]);
});

test("city lists are derived per market", () => {
  assert.deepEqual(citiesFor(stations, "UG"), ["Jinja", "Kampala"]);
  assert.deepEqual(citiesFor(stations, "KE"), ["Nairobi"]);
});

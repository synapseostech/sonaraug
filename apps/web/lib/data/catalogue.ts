/**
 * Demo catalogue.
 *
 * This is deliberate sample content, not a broadcast directory. Station names
 * are fictional so no real Ugandan broadcaster is misrepresented, and every
 * surface that renders this data labels it as demo content. The shapes mirror
 * the Phase 2 database tables (stations, station_streams, podcasts,
 * podcast_episodes, videos, creators) so swapping these modules for Supabase
 * queries later does not change component contracts.
 */

export type Category =
  | "music"
  | "news"
  | "talk"
  | "sports"
  | "culture"
  | "education"
  | "business"
  | "entertainment";

export type Region = "central" | "eastern" | "northern" | "western" | "national";

export type Station = {
  id: string;
  slug: string;
  name: string;
  /**
   * Published dial position, or null where it could not be verified. Never
   * guessed: a wrong frequency is worse than an honest blank, and the player
   * subtitle falls back to the city.
   */
  frequency: string | null;
  city: string;
  region: Region;
  categories: Category[];
  languages: string[];
  tagline: string;
  description: string;
  /**
   * `broadcaster` = a real Ugandan station whose stream lives in the stream
   * registry. `demo` = fictional sample content used to exercise the UI.
   */
  origin: "broadcaster" | "demo";
  /** Only present for real stations, where the broadcaster publishes one. */
  officialWebsite?: string;
  /** Demo listener count — an invented metric, never presented as live telemetry. */
  listeners?: number;
  /** Only recorded where the broadcaster publishes it. */
  established?: number;
};

export type Episode = {
  id: string;
  slug: string;
  podcastSlug: string;
  number: number;
  title: string;
  description: string;
  durationSeconds: number;
  publishedAt: string;
};

export type Podcast = {
  id: string;
  slug: string;
  title: string;
  creator: string;
  creatorSlug: string;
  category: Category;
  description: string;
  languages: string[];
  followers: number;
  episodes: Episode[];
};

export type Video = {
  id: string;
  slug: string;
  title: string;
  creator: string;
  creatorSlug: string;
  category: Category;
  description: string;
  durationSeconds: number;
  publishedAt: string;
  views: number;
};

export type Creator = {
  id: string;
  slug: string;
  name: string;
  kind: "podcast" | "video";
  bio: string;
  followers: number;
};

/** Dial position, or an honest fallback when it could not be verified. */
export function frequencyLabel(station: Pick<Station, "frequency" | "city">): string {
  return station.frequency ? station.frequency : station.city;
}

export const CATEGORY_LABELS: Record<Category, string> = {
  music: "Music",
  news: "News",
  talk: "Talk",
  sports: "Sports",
  culture: "Culture",
  education: "Education",
  business: "Business",
  entertainment: "Entertainment",
};

export const REGION_LABELS: Record<Region, string> = {
  central: "Central",
  eastern: "Eastern",
  northern: "Northern",
  western: "Western",
  national: "National",
};

export const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  lg: "Luganda",
  sw: "Swahili",
  nyn: "Runyankole",
  ach: "Acholi",
  teo: "Ateso",
  lgg: "Lugbara",
  rub: "Rukiga",
  xog: "Lusoga",
};

export const stations: Station[] = [
  {
    id: "st-beat-fm",
    slug: "beat-fm-96-3",
    name: "Beat FM",
    frequency: "96.3 FM",
    city: "Kampala",
    region: "central",
    categories: ["music", "entertainment"],
    languages: ["lg", "en"],
    tagline: "Ekintabuli Ky'Omuziki — Luganda music radio from Kampala.",
    description:
      "Luganda-language music and talk station broadcasting on 96.3 FM in Kampala and 90.1 FM in Masaka. Relaunched in 2005 under Capital Radio, it programmes for a 30–40 audience with a strong female listenership, mixing Ugandan music with phone-in talk. Station details on this page come from the broadcaster's own station API.",
    origin: "broadcaster",
    officialWebsite: "https://beatradio.co.ug",
  },
  {
    id: "st-capital-fm",
    slug: "capital-fm-91-3",
    name: "Capital FM",
    frequency: null,
    city: "Kampala",
    region: "central",
    categories: ["news", "talk", "music"],
    languages: ["en"],
    tagline: "English-language news and talk from the Capital Radio group.",
    description:
      "News and talk station in Kampala, part of the same Capital Radio group as Beat FM. Its stream comes from the group's own station API. The published FM dial position could not be re-verified during integration, so it is left blank here rather than guessed.",
    origin: "broadcaster",
    officialWebsite: "https://capitalradio.co.ug",
  },
  {
    id: "st-bukedde",
    slug: "bukedde-fm-100-5",
    name: "Bukedde FM",
    frequency: "100.5 FM",
    city: "Kampala",
    region: "central",
    categories: ["news", "culture"],
    languages: ["lg"],
    tagline: "Luganda news and culture from Vision Group.",
    description:
      "Luganda-language news, talk and entertainment on 100.5 FM, part of the Vision Group. The official player streams HLS from the group's streaming vendor, which plays natively in current Chrome and Safari without an extra library.",
    origin: "broadcaster",
    officialWebsite: "https://bukedde.co.ug",
  },
  {
    id: "st-radio-simba",
    slug: "radio-simba",
    name: "Radio Simba",
    frequency: null,
    city: "Kampala",
    region: "central",
    categories: ["talk", "culture", "music"],
    languages: ["lg", "en"],
    tagline: "Long-running Luganda talk and music.",
    description:
      "One of Kampala's established Luganda stations, mixing talk, culture and music. The official site embeds a StreamGuys endpoint branded for a third-party aggregator, so playback works but broadcaster authorisation for aggregation is not yet confirmed.",
    origin: "broadcaster",
    officialWebsite: "https://www.radiosimba.ug",
  },
  {
    id: "st-next-radio",
    slug: "next-radio-106-1",
    name: "Next Radio",
    frequency: "106.1 FM",
    city: "Kampala",
    region: "central",
    categories: ["talk", "music"],
    languages: ["en", "lg"],
    tagline: "Talk-led adult contemporary on 106.1.",
    description:
      "Talk-led station on 106.1 FM in Kampala. Its own web player points at a Centova Cast proxy mount that returns a payload no browser can decode, so the station is listed with an accurate \"unavailable\" state instead of a play button that would fail after the click.",
    origin: "broadcaster",
    officialWebsite: "https://nextradio.co.ug",
  },
  {
    id: "st-record-fm",
    slug: "record-fm-97-7",
    name: "Record FM",
    frequency: "97.7 FM",
    city: "Kampala",
    region: "central",
    categories: ["talk", "music"],
    languages: ["lg", "en"],
    tagline: "Kampala talk and music.",
    description:
      "Talk and music station on 97.7 FM. Its website is protected by a Cloudflare bot challenge, so no stream endpoint could be inspected during integration. The station is listed with an honest \"not verified\" state and no playable audio.",
    origin: "broadcaster",
    officialWebsite: "https://recordradio.co.ug",
  },
  {
    id: "st-kampala-beat",
    slug: "kampala-beat-101-3",
    name: "Kampala Beat 101.3",
    frequency: "101.3 FM",
    city: "Kampala",
    region: "central",
    categories: ["music", "entertainment"],
    languages: ["lg", "en"],
    tagline: "The city's soundtrack, all day.",
    description:
      "Afrobeats, dancehall and Ugandan hip hop from the heart of the capital, with the mid-morning request show and a Saturday mix that runs until midnight.",
    listeners: 18400,
    established: 2009,
    origin: "demo",
  },
  {
    id: "st-kampala-news",
    slug: "kampala-news-network",
    name: "Kampala News Network",
    frequency: "102.1 FM",
    city: "Kampala",
    region: "central",
    categories: ["news", "talk"],
    languages: ["en", "lg"],
    tagline: "Verified news, every hour.",
    description:
      "Rolling bulletins, parliamentary coverage and a nightly panel on the stories shaping the country. Bulletins on the hour, headlines on the half hour.",
    listeners: 22700,
    established: 2004,
    origin: "demo",
  },
  {
    id: "st-luganda-today",
    slug: "luganda-today-93-8",
    name: "Luganda Today 93.8",
    frequency: "93.8 FM",
    city: "Kampala",
    region: "central",
    categories: ["talk", "culture"],
    languages: ["lg"],
    tagline: "Oluganda buli lunaku.",
    description:
      "Conversation, proverbs and call-in debate entirely in Luganda, plus a weekday evening show on clan history and traditional music.",
    listeners: 15100,
    established: 2012,
    origin: "demo",
  },
  {
    id: "st-nakawa-sports",
    slug: "nakawa-sports-radio",
    name: "Nakawa Sports Radio",
    frequency: "90.4 FM",
    city: "Kampala",
    region: "central",
    categories: ["sports"],
    languages: ["en", "lg"],
    tagline: "Every match, every league.",
    description:
      "Uganda Premier League commentary, athletics from the national stadium and a Sunday phone-in that regularly runs over its slot.",
    listeners: 9800,
    established: 2016,
    origin: "demo",
  },
  {
    id: "st-pearl-business",
    slug: "pearl-business-radio",
    name: "Pearl Business Radio",
    frequency: "99.7 FM",
    city: "Kampala",
    region: "central",
    categories: ["business", "news"],
    languages: ["en"],
    tagline: "Markets, money and enterprise.",
    description:
      "Morning market open, SME clinics and interviews with founders across the region. A quieter alternative to the news cycle.",
    listeners: 7600,
    established: 2018,
    origin: "demo",
  },
  {
    id: "st-nile-wave",
    slug: "nile-wave-96-1",
    name: "Nile Wave 96.1",
    frequency: "96.1 FM",
    city: "Jinja",
    region: "eastern",
    categories: ["music", "entertainment"],
    languages: ["xog", "en"],
    tagline: "From the source of the Nile.",
    description:
      "Lusoga music, weekend boat-party broadcasts from the lakeside and a widely followed evening reggae hour.",
    listeners: 6400,
    established: 2011,
    origin: "demo",
  },
  {
    id: "st-source-jinja",
    slug: "source-fm-jinja",
    name: "Source FM Jinja",
    frequency: "91.1 FM",
    city: "Jinja",
    region: "eastern",
    categories: ["news", "talk"],
    languages: ["xog", "en"],
    tagline: "The eastern corridor, explained.",
    description:
      "District news, sugar-belt farming updates and a weekday agriculture phone-in for smallholders in Busoga.",
    listeners: 5100,
    established: 2007,
    origin: "demo",
  },
  {
    id: "st-gulu-voice",
    slug: "gulu-voice-92-5",
    name: "Gulu Voice 92.5",
    frequency: "92.5 FM",
    city: "Gulu",
    region: "northern",
    categories: ["talk", "news"],
    languages: ["ach", "en"],
    tagline: "Northern voices, unfiltered.",
    description:
      "Acholi-language current affairs, post-conflict reconstruction reporting and a nightly music request hour for the Acholi sub-region.",
    listeners: 8800,
    established: 2008,
    origin: "demo",
  },
  {
    id: "st-mbarara",
    slug: "mbarara-fm-88-9",
    name: "Mbarara FM 88.9",
    frequency: "88.9 FM",
    city: "Mbarara",
    region: "western",
    categories: ["music", "talk"],
    languages: ["nyn", "en"],
    tagline: "Ankole's daily companion.",
    description:
      "Runyankole conversation, cattle-market reports and an evening show built around Ankole vocal music.",
    listeners: 7200,
    established: 2010,
    origin: "demo",
  },
  {
    id: "st-rwenzori",
    slug: "rwenzori-fm-89-6",
    name: "Rwenzori FM 89.6",
    frequency: "89.6 FM",
    city: "Fort Portal",
    region: "western",
    categories: ["music", "culture"],
    languages: ["lgg", "en"],
    tagline: "Voices from the mountains.",
    description:
      "Lugbara and Runyoro music, tourism features from the Rwenzori foothills and a Saturday cultural segment.",
    listeners: 4300,
    established: 2014,
    origin: "demo",
  },
  {
    id: "st-bwindi",
    slug: "bwindi-culture-radio",
    name: "Bwindi Culture Radio",
    frequency: "94.6 FM",
    city: "Kabale",
    region: "western",
    categories: ["culture", "education"],
    languages: ["rub", "en"],
    tagline: "Heritage, held in common.",
    description:
      "Community radio for Kigezi: Rukiga storytelling, conservation reporting and school-exam revision broadcasts.",
    listeners: 3900,
    established: 2015,
    origin: "demo",
  },
  {
    id: "st-kidepo",
    slug: "kidepo-fm-95-2",
    name: "Kidepo FM 95.2",
    frequency: "95.2 FM",
    city: "Moroto",
    region: "northern",
    categories: ["culture", "education"],
    languages: ["teo", "en"],
    tagline: "Karamoja on air.",
    description:
      "Ateso-language programming on pastoralism, water access and grazing corridors, with a daily livestock price bulletin.",
    listeners: 2700,
    established: 2017,
    origin: "demo",
  },
  {
    id: "st-entebbe",
    slug: "entebbe-community-radio",
    name: "Entebbe Community Radio",
    frequency: "87.9 FM",
    city: "Entebbe",
    region: "central",
    categories: ["education", "talk"],
    languages: ["lg", "en"],
    tagline: "Radio for the lakeshore.",
    description:
      "A non-profit station run with fishing communities: lake safety, school enrolment and a weekly youth skills clinic.",
    listeners: 2100,
    established: 2013,
    origin: "demo",
  },
  {
    id: "st-lakeside-talk",
    slug: "lakeside-talk-97-4",
    name: "Lakeside Talk 97.4",
    frequency: "97.4 FM",
    city: "Entebbe",
    region: "central",
    categories: ["talk", "entertainment"],
    languages: ["en"],
    tagline: "Long-form conversation.",
    description:
      "One guest, one hour. Interviews with writers, engineers and public servants, plus a monthly live audience recording.",
    listeners: 3400,
    established: 2019,
    origin: "demo",
  },
];

const podcastMatatu: Podcast = {
  id: "pc-matatu",
  slug: "matatu-chronicles",
  title: "Matatu Chronicles",
  creator: "Aisha Namutebi",
  creatorSlug: "aisha-namutebi",
  category: "culture",
  description:
    "Short, funny and occasionally furious stories from Kampala's taxi parks, told by the people who ride them every day.",
  languages: ["en", "lg"],
  followers: 21400,
  episodes: [
    {
      id: "ep-matatu-14",
      slug: "the-conductor-who-remembered-every-name",
      podcastSlug: "matatu-chronicles",
      number: 14,
      title: "The conductor who remembered every name",
      description:
        "Isaac has worked the same Kampala route for nine years. He knows where every regular gets off, and he has opinions about all of them.",
      durationSeconds: 1_842,
      publishedAt: "2026-11-18",
    },
    {
      id: "ep-matatu-13",
      slug: "fares-after-fuel",
      podcastSlug: "matatu-chronicles",
      number: 13,
      title: "Why fares move before fuel does",
      description:
        "A stage-by-stage breakdown of how a fare is set, who decides it, and why the price changes twice in the same morning.",
      durationSeconds: 2_217,
      publishedAt: "2026-11-11",
    },
    {
      id: "ep-matatu-12",
      slug: "the-old-taxi-park",
      podcastSlug: "matatu-chronicles",
      number: 12,
      title: "The last week of the old taxi park",
      description:
        "Recorded over five mornings as traders, drivers and cleaners packed up a park that had been in use for forty years.",
      durationSeconds: 2_640,
      publishedAt: "2026-11-04",
    },
    {
      id: "ep-matatu-11",
      slug: "night-shift",
      podcastSlug: "matatu-chronicles",
      number: 11,
      title: "Night shift",
      description:
        "What the city sounds like from inside a taxi at 2am, and the people who only ever see Kampala in the dark.",
      durationSeconds: 1_596,
      publishedAt: "2026-10-28",
    },
  ],
};

const podcastBusiness: Podcast = {
  id: "pc-business",
  slug: "the-kampala-business-show",
  title: "The Kampala Business Show",
  creator: "Nakato Ssemakula",
  creatorSlug: "nakato-ssemakula",
  category: "business",
  description:
    "Weekly conversations with founders and operators building companies in Uganda — margins, supply chains and the parts that almost failed.",
  languages: ["en"],
  followers: 16800,
  episodes: [
    {
      id: "ep-biz-42",
      slug: "roasting-at-scale",
      podcastSlug: "the-kampala-business-show",
      number: 42,
      title: "Roasting at scale: a coffee exporter's year",
      description:
        "From a single roaster in Ntinda to 40 tonnes a month. What broke first, and what the numbers actually look like.",
      durationSeconds: 2_988,
      publishedAt: "2026-11-19",
    },
    {
      id: "ep-biz-41",
      slug: "the-credit-question",
      podcastSlug: "the-kampala-business-show",
      number: 41,
      title: "The credit question nobody asks",
      description:
        "Two lenders and a shop owner walk through a working-capital application line by line.",
      durationSeconds: 2_436,
      publishedAt: "2026-11-12",
    },
    {
      id: "ep-biz-40",
      slug: "delivery-is-the-product",
      podcastSlug: "the-kampala-business-show",
      number: 40,
      title: "Delivery is the product",
      description:
        "Boda logistics, cold chains and why the last three kilometres decide whether a grocery business survives.",
      durationSeconds: 2_712,
      publishedAt: "2026-11-05",
    },
    {
      id: "ep-biz-39",
      slug: "pricing-in-shillings",
      podcastSlug: "the-kampala-business-show",
      number: 39,
      title: "Pricing in shillings",
      description:
        "How five consumer brands set prices when input costs move monthly and customers pay in cash.",
      durationSeconds: 2_250,
      publishedAt: "2026-10-29",
    },
  ],
};

const podcastLuganda: Podcast = {
  id: "pc-luganda",
  slug: "luganda-for-beginners",
  title: "Luganda for Beginners",
  creator: "Musa Kigongo",
  creatorSlug: "musa-kigongo",
  category: "education",
  description:
    "Twenty minutes a week, one conversation at a time. Built for people who grew up hearing Luganda but never learned to speak it.",
  languages: ["en", "lg"],
  followers: 31200,
  episodes: [
    {
      id: "ep-lug-20",
      slug: "at-the-market",
      podcastSlug: "luganda-for-beginners",
      number: 20,
      title: "At the market",
      description: "Prices, quantities and the polite way to disagree about both.",
      durationSeconds: 1_148,
      publishedAt: "2026-11-17",
    },
    {
      id: "ep-lug-19",
      slug: "greetings-that-mean-more",
      podcastSlug: "luganda-for-beginners",
      number: 19,
      title: "Greetings that mean more than hello",
      description: "Why 'oli otya' is rarely the whole greeting, and what to say next.",
      durationSeconds: 1_062,
      publishedAt: "2026-11-10",
    },
    {
      id: "ep-lug-18",
      slug: "giving-directions",
      podcastSlug: "luganda-for-beginners",
      number: 18,
      title: "Giving directions",
      description: "Left, right, straight ahead — and the landmarks people actually use.",
      durationSeconds: 1_214,
      publishedAt: "2026-11-03",
    },
    {
      id: "ep-lug-17",
      slug: "on-the-phone",
      podcastSlug: "luganda-for-beginners",
      number: 17,
      title: "On the phone",
      description: "Opening a call, asking for someone, and ending it without being rude.",
      durationSeconds: 986,
      publishedAt: "2026-10-27",
    },
  ],
};

const podcastHistory: Podcast = {
  id: "pc-history",
  slug: "pearl-of-africa-history",
  title: "Pearl of Africa History",
  creator: "Dr. Timothy Okello",
  creatorSlug: "timothy-okello",
  category: "education",
  description:
    "Long-form history of the region, told through documents, oral testimony and the arguments historians still have about them.",
  languages: ["en"],
  followers: 12900,
  episodes: [
    {
      id: "ep-hist-31",
      slug: "the-1900-agreement",
      podcastSlug: "pearl-of-africa-history",
      number: 31,
      title: "The 1900 Agreement, clause by clause",
      description:
        "What the Buganda Agreement actually said about land, and how the interpretation shifted over a century.",
      durationSeconds: 3_540,
      publishedAt: "2026-11-16",
    },
    {
      id: "ep-hist-30",
      slug: "rail-to-the-lake",
      podcastSlug: "pearl-of-africa-history",
      number: 30,
      title: "The railway to the lake",
      description:
        "Labour, engineering and the towns that appeared and disappeared along the Uganda Railway.",
      durationSeconds: 3_180,
      publishedAt: "2026-11-09",
    },
    {
      id: "ep-hist-29",
      slug: "markets-before-money",
      podcastSlug: "pearl-of-africa-history",
      number: 29,
      title: "Markets before money",
      description: "Exchange systems in the interlacustrine region before colonial currency.",
      durationSeconds: 2_940,
      publishedAt: "2026-11-02",
    },
  ],
};

const podcastTech: Podcast = {
  id: "pc-tech",
  slug: "tech-in-kampala",
  title: "Tech in Kampala",
  creator: "Brian Wasswa",
  creatorSlug: "brian-wasswa",
  category: "business",
  description:
    "Engineers and product people talking about what they actually ship in Uganda: payments, connectivity, offline-first design and the cost of data.",
  languages: ["en"],
  followers: 9400,
  episodes: [
    {
      id: "ep-tech-28",
      slug: "building-for-2g",
      podcastSlug: "tech-in-kampala",
      number: 28,
      title: "Building for 2G, by choice",
      description:
        "A payments team explains why their app still works on an EDGE connection and what that cost them.",
      durationSeconds: 2_580,
      publishedAt: "2026-11-15",
    },
    {
      id: "ep-tech-27",
      slug: "the-cost-of-a-megabyte",
      podcastSlug: "tech-in-kampala",
      number: 27,
      title: "The cost of a megabyte",
      description: "Data pricing, bundle design and how users decide what to load.",
      durationSeconds: 2_212,
      publishedAt: "2026-11-08",
    },
    {
      id: "ep-tech-26",
      slug: "offline-first-field-notes",
      podcastSlug: "tech-in-kampala",
      number: 26,
      title: "Offline-first field notes",
      description: "Sync conflicts, queue design and the support calls that follow.",
      durationSeconds: 2_045,
      publishedAt: "2026-11-01",
    },
  ],
};

const podcastFootball: Podcast = {
  id: "pc-football",
  slug: "the-football-hour-ug",
  title: "The Football Hour UG",
  creator: "Joel Ssembatya",
  creatorSlug: "joel-ssembatya",
  category: "sports",
  description:
    "Uganda Premier League tactics, transfer gossip and the national team, with a rotating panel of coaches and reporters.",
  languages: ["en", "lg"],
  followers: 18700,
  episodes: [
    {
      id: "ep-fb-55",
      slug: "derby-week-review",
      podcastSlug: "the-football-hour-ug",
      number: 55,
      title: "Derby week review",
      description: "Two matches, one red card, and a midfield that never settled.",
      durationSeconds: 2_940,
      publishedAt: "2026-11-20",
    },
    {
      id: "ep-fb-54",
      slug: "the-academy-question",
      podcastSlug: "the-football-hour-ug",
      number: 54,
      title: "The academy question",
      description: "Why the best junior sides keep losing their players at eighteen.",
      durationSeconds: 2_760,
      publishedAt: "2026-11-13",
    },
    {
      id: "ep-fb-53",
      slug: "cranes-camp-report",
      podcastSlug: "the-football-hour-ug",
      number: 53,
      title: "Cranes camp report",
      description: "Who is fit, who is not, and the shape the coach keeps returning to.",
      durationSeconds: 2_520,
      publishedAt: "2026-11-06",
    },
  ],
};

const podcastCooking: Podcast = {
  id: "pc-cooking",
  slug: "cooking-with-nakato",
  title: "Cooking with Nakato",
  creator: "Nakato Nabirye",
  creatorSlug: "nakato-nabirye",
  category: "culture",
  description:
    "Home cooking from across the country, recorded in real kitchens. Fewer measurements, more technique and a lot of arguing about groundnut sauce.",
  languages: ["en", "lg"],
  followers: 24600,
  episodes: [
    {
      id: "ep-cook-33",
      slug: "groundnut-sauce-three-ways",
      podcastSlug: "cooking-with-nakato",
      number: 33,
      title: "Groundnut sauce, three ways",
      description: "Roasted, boiled and the shortcut that Nakato refuses to endorse.",
      durationSeconds: 1_860,
      publishedAt: "2026-11-19",
    },
    {
      id: "ep-cook-32",
      slug: "matooke-that-holds",
      podcastSlug: "cooking-with-nakato",
      number: 32,
      title: "Matooke that holds",
      description: "Steaming, wrapping and the difference between soft and collapsing.",
      durationSeconds: 1_740,
      publishedAt: "2026-11-12",
    },
    {
      id: "ep-cook-31",
      slug: "the-rolex-standard",
      podcastSlug: "cooking-with-nakato",
      number: 31,
      title: "The rolex standard",
      description: "A street vendor in Wandegeya sets the benchmark, and we try to match it.",
      durationSeconds: 1_620,
      publishedAt: "2026-11-05",
    },
  ],
};

const podcastPoetry: Podcast = {
  id: "pc-poetry",
  slug: "poetry-from-makerere",
  title: "Poetry from Makerere",
  creator: "Sarah Achieng",
  creatorSlug: "sarah-achieng",
  category: "culture",
  description:
    "Recorded readings and unguarded conversations with poets published in Kampala, in English, Luganda and Acholi.",
  languages: ["en", "lg", "ach"],
  followers: 6800,
  episodes: [
    {
      id: "ep-poet-18",
      slug: "a-room-of-ones-own",
      podcastSlug: "poetry-from-makerere",
      number: 18,
      title: "A room of one's own",
      description: "Three poets on writing at home, in shared flats and on long commutes.",
      durationSeconds: 2_340,
      publishedAt: "2026-11-14",
    },
    {
      id: "ep-poet-17",
      slug: "reading-in-acholi",
      podcastSlug: "poetry-from-makerere",
      number: 17,
      title: "Reading in Acholi",
      description: "A bilingual reading, followed by a conversation about translation loss.",
      durationSeconds: 2_100,
      publishedAt: "2026-11-07",
    },
  ],
};

/** Curated order — the first entries are the ones the editor is promoting. */
export const podcasts: Podcast[] = [
  podcastBusiness,
  podcastMatatu,
  podcastLuganda,
  podcastFootball,
  podcastCooking,
  podcastHistory,
  podcastTech,
  podcastPoetry,
];

export const videos: Video[] = [
  {
    id: "vd-street-food",
    slug: "kampala-street-food-tour",
    title: "A Kampala street food tour in 12 minutes",
    creator: "Boda Diaries",
    creatorSlug: "boda-diaries",
    category: "culture",
    description:
      "From a rolex stand in Wandegeya to muchomo in Kabalagala, one afternoon and far too much food.",
    durationSeconds: 742,
    publishedAt: "2026-11-19",
    views: 41200,
  },
  {
    id: "vd-bunyonyi",
    slug: "sunrise-over-lake-bunyonyi",
    title: "Sunrise over Lake Bunyonyi",
    creator: "Kigezi Lens",
    creatorSlug: "kigezi-lens",
    category: "culture",
    description:
      "Twenty-nine islands, one canoe and the first light on the water. Shot over three mornings in Kabale.",
    durationSeconds: 486,
    publishedAt: "2026-11-17",
    views: 28400,
  },
  {
    id: "vd-boda-ep1",
    slug: "boda-boda-diaries-episode-one",
    title: "Boda Boda Diaries: Episode One",
    creator: "Boda Diaries",
    creatorSlug: "boda-diaries",
    category: "entertainment",
    description:
      "A week riding with a Kampala boda rider: the school run, the fuel queue and the app that changed his day.",
    durationSeconds: 1_284,
    publishedAt: "2026-11-15",
    views: 63900,
  },
  {
    id: "vd-rolex-stand",
    slug: "inside-a-kampala-rolex-stand",
    title: "Inside a Kampala rolex stand",
    creator: "Boda Diaries",
    creatorSlug: "boda-diaries",
    category: "culture",
    description: "Six hours, two hundred chapattis and one very patient vendor.",
    durationSeconds: 612,
    publishedAt: "2026-11-12",
    views: 19700,
  },
  {
    id: "vd-cranes",
    slug: "uganda-cranes-road-to-afcon",
    title: "Uganda Cranes: the road to AFCON",
    creator: "Touchline UG",
    creatorSlug: "touchline-ug",
    category: "sports",
    description: "Qualifying highlights, dressing-room access and the tactical shift that turned the group.",
    durationSeconds: 1_560,
    publishedAt: "2026-11-10",
    views: 88600,
  },
  {
    id: "vd-graduation",
    slug: "makerere-graduation-in-four-minutes",
    title: "Makerere graduation in four minutes",
    creator: "Campus TV",
    creatorSlug: "campus-tv",
    category: "education",
    description: "The morning, the queue for gowns and the speeches nobody stayed for.",
    durationSeconds: 264,
    publishedAt: "2026-11-08",
    views: 12300,
  },
  {
    id: "vd-matatu-fares",
    slug: "how-matatu-fares-are-set",
    title: "How matatu fares are actually set",
    creator: "Touchline UG",
    creatorSlug: "touchline-ug",
    category: "news",
    description: "We followed a stage chairperson for a day to find out who moves the price.",
    durationSeconds: 934,
    publishedAt: "2026-11-06",
    views: 33400,
  },
  {
    id: "vd-night-market",
    slug: "night-market-in-nakasero",
    title: "Night market in Nakasero",
    creator: "Boda Diaries",
    creatorSlug: "boda-diaries",
    category: "culture",
    description: "Produce arrives at 1am. This is what happens before the city wakes up.",
    durationSeconds: 558,
    publishedAt: "2026-11-03",
    views: 15600,
  },
  {
    id: "vd-coffee",
    slug: "coffee-from-mbale-to-your-cup",
    title: "Coffee from Mbale to your cup",
    creator: "Kigezi Lens",
    creatorSlug: "kigezi-lens",
    category: "business",
    description: "A farmer, a cooperative and a roaster explain where the money actually goes.",
    durationSeconds: 1_062,
    publishedAt: "2026-10-31",
    views: 22100,
  },
  {
    id: "vd-drummers",
    slug: "sunset-drummers-of-busoga",
    title: "Sunset drummers of Busoga",
    creator: "Busoga Arts",
    creatorSlug: "busoga-arts",
    category: "culture",
    description: "An evening rehearsal with a drumming troupe that has played the same grounds for thirty years.",
    durationSeconds: 498,
    publishedAt: "2026-10-28",
    views: 9800,
  },
];

export const creators: Creator[] = [
  {
    id: "cr-boda",
    slug: "boda-diaries",
    name: "Boda Diaries",
    kind: "video",
    bio: "Short documentaries about how Kampala actually moves, eats and works.",
    followers: 74200,
  },
  {
    id: "cr-kigezi",
    slug: "kigezi-lens",
    name: "Kigezi Lens",
    kind: "video",
    bio: "Landscape and travel films from the south-west, shot slowly and without a drone budget.",
    followers: 38600,
  },
  {
    id: "cr-touchline",
    slug: "touchline-ug",
    name: "Touchline UG",
    kind: "video",
    bio: "Football reporting and match analysis from the Uganda Premier League.",
    followers: 91400,
  },
  {
    id: "cr-campus",
    slug: "campus-tv",
    name: "Campus TV",
    kind: "video",
    bio: "Student journalism from Makerere and Kyambogo.",
    followers: 15800,
  },
  {
    id: "cr-busoga",
    slug: "busoga-arts",
    name: "Busoga Arts",
    kind: "video",
    bio: "Music, dance and craft from the Busoga region.",
    followers: 12400,
  },
  {
    id: "cr-nakato",
    slug: "nakato-nabirye",
    name: "Nakato Nabirye",
    kind: "podcast",
    bio: "Cook, writer and host of Cooking with Nakato.",
    followers: 24600,
  },
];

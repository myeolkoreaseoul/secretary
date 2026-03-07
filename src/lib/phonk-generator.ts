// ── Types ──────────────────────────────────────────────
export interface GeneratedPrompt {
  prompt: string;
  genre: string;
  bpm: number;
  hash: string;
}

export interface GeneratorConfig {
  count: number;
  bpmMin: number;
  bpmMax: number;
  artistRef: boolean;
  genreFilter?: string;
}

export interface HistoryEntry {
  id: string;
  date: string;
  count: number;
  prompts: GeneratedPrompt[];
}

// ── Prompts DB (from prompts.json) ─────────────────────
export const PROMPTS_DB = {
  genres: [
    "phonk brasileiro",
    "drift phonk + brasileiro",
    "gym phonk brasileiro",
    "funk carioca + phonk",
    "trap brasileiro + phonk",
    "mega funk phonk",
    "anime phonk brasileiro",
  ],
  bpm_range: [125, 130, 135, 140, 145, 150, 155, 160],
  moods: [
    "dark, menacing",
    "powerful, epic",
    "hypnotic, trance-like",
    "party, euphoric",
    "aggressive, intense",
    "cinematic, dramatic",
  ],
  instruments: [
    "heavy 808 bass, cowbell, distorted synth lead",
    "deep sub bass, brass stabs, chopped vocal chops",
    "aggressive 808 slides, steel drums, latin percussion",
    "punchy kick, analog synth, tambourine rolls",
    "detuned lead synth, 808 glides, shaker, clap layers",
  ],
  fx: [
    "vinyl crackle, tape stop, bass boost",
    "reverb wash, sidechain pump, lo-fi filter",
    "pitch shift vocals, distortion, stereo widening",
    "echo delay, bitcrusher, bass distortion",
    "flanger sweep, reverse reverb, hard clipper",
  ],
  structures: [
    "intro 4bars, drop, verse, drop, breakdown, final drop",
    "ambient intro, build-up, heavy drop, loop section, outro",
    "straight drop, verse, double-time drop, bridge, final drop",
    "intro riser, drop, breakdown, drop variation, hard outro",
    "minimal intro, progressive build, main drop, half-time section, climax drop",
    "cold open drop, verse groove, switchup drop, outro fade",
  ],
  artist_refs: [
    "MC GW style",
    "DJ Cyberkills vibe",
    "DYVALL influence",
    "Slowboy aesthetic",
    "MC Rick style",
    "KORDHELL energy",
  ],
} as const;

// ── Genre colors for UI ────────────────────────────────
export const GENRE_COLORS: Record<string, string> = {
  "phonk brasileiro": "bg-red-500/20 text-red-400 border-red-500/30",
  "drift phonk + brasileiro": "bg-purple-500/20 text-purple-400 border-purple-500/30",
  "gym phonk brasileiro": "bg-orange-500/20 text-orange-400 border-orange-500/30",
  "funk carioca + phonk": "bg-green-500/20 text-green-400 border-green-500/30",
  "trap brasileiro + phonk": "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "mega funk phonk": "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  "anime phonk brasileiro": "bg-pink-500/20 text-pink-400 border-pink-500/30",
};

// ── Helpers ────────────────────────────────────────────
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}

function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ── Generator ──────────────────────────────────────────
export function generatePrompts(config: GeneratorConfig): GeneratedPrompt[] {
  const { count, bpmMin, bpmMax, artistRef, genreFilter } = config;
  const db = PROMPTS_DB;

  // Filter BPM range
  const bpmPool = db.bpm_range.filter((b) => b >= bpmMin && b <= bpmMax);
  if (bpmPool.length === 0) return [];

  // Genre distribution
  let assignedGenres: string[];
  if (genreFilter) {
    assignedGenres = Array(count).fill(genreFilter);
  } else {
    const perGenre = Math.floor(count / db.genres.length);
    const remainder = count % db.genres.length;
    assignedGenres = [];
    for (const genre of db.genres) {
      for (let i = 0; i < perGenre; i++) assignedGenres.push(genre);
    }
    const extras = shuffleArray([...db.genres]).slice(0, remainder);
    assignedGenres.push(...extras);
  }
  assignedGenres = shuffleArray(assignedGenres);

  // Generate with dedup
  const prompts: GeneratedPrompt[] = [];
  const usedHashes = new Set<string>();
  let attempts = 0;
  const maxAttempts = count * 5;
  let idx = 0;

  while (prompts.length < count && attempts < maxAttempts) {
    attempts++;
    const genre = assignedGenres[idx % assignedGenres.length];
    const bpm = pick(bpmPool);
    const mood = pick(db.moods);
    const instruments = pick(db.instruments);
    const fx = pick(db.fx);
    const structure = pick(db.structures);

    let artistPart = "";
    if (artistRef && Math.random() < 0.3) {
      artistPart = `, ${pick(db.artist_refs)}`;
    }

    const prompt = `${genre}, ${bpm} BPM, ${mood}, ${instruments}, ${fx}, ${structure}${artistPart}`;
    const hash = djb2Hash(prompt);

    if (usedHashes.has(hash)) continue;
    usedHashes.add(hash);

    prompts.push({ prompt, genre, bpm, hash });
    idx++;
  }

  return prompts;
}

// ── localStorage History ───────────────────────────────
const HISTORY_KEY = "phonk-generator-history";
const MAX_HISTORY = 20;

export function getHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveHistory(prompts: GeneratedPrompt[]): HistoryEntry {
  const entry: HistoryEntry = {
    id: Date.now().toString(36),
    date: new Date().toISOString(),
    count: prompts.length,
    prompts,
  };

  const history = getHistory();
  history.unshift(entry);
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;

  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  return entry;
}

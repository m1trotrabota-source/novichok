import { KB } from "./data.js";

export function norm(s) {
  return s.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9\s]/gi, " ");
}

export function stem(t) {
  return t.length > 5 ? t.slice(0, 5) : t;
}

const SYNONYMS = {
  "зп": "зарпл", "получ": "зарпл", "деньг": "зарпл", "платя": "зарпл", "платят": "зарпл",
  "поест": "обед", "кушат": "обед", "жрат": "обед", "переку": "перер",
  "одежд": "форма", "дресс": "форма", "одеват": "форма", "одеть": "форма",
  "карто": "пропу", "карта": "пропу", "пустя": "пропу", "войти": "пропу", "зайти": "пропу",
  "забол": "больн", "прост": "больн", "темпе": "больн",
  "полом": "техни", "слома": "техни", "завис": "техни",
  "битри": "битри", "графи": "графи", "смены": "смена", "смену": "смена",
  "увол": "испыт"
};

function expand(tokens) {
  const out = new Set();
  for (const t of tokens) {
    const s = stem(t);
    out.add(s);
    if (SYNONYMS[s]) out.add(SYNONYMS[s]);
    if (SYNONYMS[t]) out.add(SYNONYMS[t]);
  }
  return [...out];
}

const KB_INDEX = KB.map((entry) => {
  const kwStems = entry.kw.flatMap((phrase) => norm(phrase).split(/\s+/).filter(Boolean).map(stem));
  const titleStems = norm(entry.title).split(/\s+/).filter(Boolean).map(stem);
  return { entry, kwStems, titleStems };
});

const STOPWORDS = new Set(["как", "что", "это", "для", "есть", "можно", "ли", "во", "на", "за", "из", "от", "до", "по", "и", "в", "а", "о", "у", "мне", "меня", "если", "где", "нужно", "надо", "мой", "моя", "свой", "своя", "быть", "будет", "там", "тут", "вот", "ещё", "уже"]);

export function search(query) {
  const tokens = norm(query).split(/\s+/).filter((t) => t.length > 1 && !STOPWORDS.has(t));
  if (tokens.length === 0) return [];
  const needles = expand(tokens);
  const scored = KB_INDEX.map(({ entry, kwStems, titleStems }) => {
    let score = 0;
    for (const n of needles) {
      if (kwStems.some((k) => k.startsWith(n) || n.startsWith(k))) score += 2;
      if (titleStems.some((k) => k.startsWith(n) || n.startsWith(k))) score += 3;
    }
    return { entry, score };
  });
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
}

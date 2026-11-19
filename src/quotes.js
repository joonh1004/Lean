// All quote copy below is original sample copy, not an attributed quotation.
export const STORAGE_KEY = "joonh.workspace.quoteGate.v1";
export const defaultState = () => ({
  version: 1,
  quotes: [
    { id: "sample-1", text: "작은 시작을 오늘의 기록으로 남기자." },
    { id: "sample-2", text: "배운 것을 직접 해보며 나의 것으로 만들자." },
    { id: "sample-3", text: "어제의 질문에서 오늘의 한 걸음을 찾자." },
  ],
  days: {},
  bag: [],
  lastId: null,
});
export function parseState(raw) {
  const value = JSON.parse(raw);
  const object = (x) =>
    x !== null && typeof x === "object" && !Array.isArray(x);
  const text = (x) => typeof x === "string" && x.trim().length > 0;
  const quote = (q) => object(q) && text(q.id) && text(q.text);
  if (
    !object(value) ||
    value.version !== 1 ||
    !Array.isArray(value.quotes) ||
    !value.quotes.every(quote) ||
    new Set(value.quotes.map((q) => q.id)).size !== value.quotes.length ||
    !Array.isArray(value.bag) ||
    !value.bag.every(text) ||
    !(value.lastId === null || text(value.lastId)) ||
    !object(value.days) ||
    !Object.entries(value.days).every(
      ([day, q]) =>
        /^\d{4}-\d{2}-\d{2}$/.test(day) &&
        quote(q) &&
        typeof q.completed === "boolean",
    )
  )
    throw new Error("Invalid quote storage");
  return value;
}
export function addQuote(state, text, id = crypto.randomUUID()) {
  if (
    typeof text !== "string" ||
    !text.trim() ||
    state.quotes.some((q) => q.id === id)
  )
    throw new Error("Invalid quote");
  return {
    ...state,
    quotes: [...state.quotes, { id, text }],
    bag: [...state.bag, id],
  };
}
export function editQuote(state, id, text) {
  if (
    typeof text !== "string" ||
    !text.trim() ||
    !state.quotes.some((q) => q.id === id)
  )
    throw new Error("Invalid quote");
  return {
    ...state,
    quotes: state.quotes.map((q) => (q.id === id ? { ...q, text } : q)),
  };
}
export function removeQuote(state, id) {
  if (!state.quotes.some((q) => q.id === id)) throw new Error("Unknown quote");
  return {
    ...state,
    quotes: state.quotes.filter((q) => q.id !== id),
    bag: state.bag.filter((x) => x !== id),
  };
}
export function saveQuoteState(storage, state, expected) {
  const serialized = JSON.stringify(state);
  parseState(serialized);
  const original = storage.getItem(STORAGE_KEY);
  if (original !== null) {
    const current = parseState(original);
    if (expected && JSON.stringify(current) !== JSON.stringify(expected))
      throw new Error("Quote storage changed; reload before editing");
  } else if (expected) throw new Error("Quote storage missing");
  try {
    storage.setItem(STORAGE_KEY, serialized);
    if (storage.getItem(STORAGE_KEY) !== serialized)
      throw new Error("Storage verification failed");
  } catch (error) {
    // Best-effort rollback; browser storage is not a transactional database.
    try {
      if (original === null) storage.removeItem(STORAGE_KEY);
      else storage.setItem(STORAGE_KEY, original);
    } catch {
      /* Keep the UI draft and report failure even if rollback is blocked. */
    }
    throw error;
  }
}
export function canEnter(input, text, composing = false) {
  const normalize = (s) => s.normalize("NFC").replace(/\r\n?/g, "\n");
  return !composing && !!text && normalize(input) === normalize(text);
}
export function completeDay(state, day, input, composing = false) {
  const assigned = state.days[day];
  if (!assigned || !canEnter(input, assigned.text, composing)) return state;
  return {
    ...state,
    days: { ...state.days, [day]: { ...assigned, completed: true } },
  };
}
export function assignDay(state, day, rng = Math.random) {
  if (state.days[day] || !state.quotes.length) return state;
  let bag = state.bag.filter((id) => state.quotes.some((q) => q.id === id));
  if (!bag.length) {
    bag = state.quotes.map((q) => q.id);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    if (bag.length > 1 && bag[0] === state.lastId)
      [bag[0], bag[1]] = [bag[1], bag[0]];
  }
  const id = bag[0],
    quote = state.quotes.find((q) => q.id === id);
  return {
    ...state,
    bag: bag.slice(1),
    lastId: id,
    days: { ...state.days, [day]: { id, text: quote.text, completed: false } },
  };
}

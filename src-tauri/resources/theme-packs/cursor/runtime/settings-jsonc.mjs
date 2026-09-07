// Small, dependency-free editor for top-level VS Code settings. Never use a
// line/substring replacement: comments, nested objects and compact JSON are valid.
export function inspect(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    if (/\s|\uFEFF/.test(text[i])) { i++; continue; }
    if (text.startsWith('//', i)) { i = text.indexOf('\n', i); if (i < 0) break; continue; }
    if (text.startsWith('/*', i)) {
      const end = text.indexOf('*/', i + 2);
      if (end < 0) throw new Error('SETTINGS_INVALID: unclosed comment');
      i = end + 2; continue;
    }
    const start = i;
    if (text[i] === '"') {
      i++;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\') i++;
        i++;
      }
      if (i >= text.length) throw new Error('SETTINGS_INVALID: unclosed string');
      i++;
    } else if ('{}[]:,'.includes(text[i])) i++;
    else while (i < text.length && !/[\s{}\[\]:,\/]/.test(text[i])) i++;
    if (i === start) throw new Error('SETTINGS_INVALID: invalid token');
    tokens.push({ raw: text.slice(start, i), start, end: i });
  }
  const normalized = tokens.filter((t, n) => !(t.raw === ',' && [']', '}'].includes(tokens[n + 1]?.raw))).map(t => t.raw).join(' ');
  let value;
  try { value = JSON.parse(normalized); } catch { throw new Error('SETTINGS_INVALID: invalid JSONC'); }
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('SETTINGS_INVALID: expected object');
  const properties = new Map();
  let index = 1;
  while (index < tokens.length - 1) {
    const keyToken = tokens[index++];
    const key = JSON.parse(keyToken.raw);
    if (properties.has(key)) throw new Error('SETTINGS_INVALID: duplicate top-level key');
    index++; // colon, already checked by JSON.parse
    const first = tokens[index];
    let depth = 0;
    do {
      const raw = tokens[index++].raw;
      if (raw === '{' || raw === '[') depth++;
      if (raw === '}' || raw === ']') depth--;
    } while (depth > 0);
    const last = tokens[index - 1];
    const comma = tokens[index]?.raw === ',' ? tokens[index++] : null;
    properties.set(key, { keyStart: keyToken.start, start: first.start, end: last.end, comma,
      raw: text.slice(first.start, last.end), value: value[key] });
  }
  return { properties, close: tokens.at(-1).start, value };
}

export function rawValue(text, key) { return inspect(text).properties.get(key)?.raw ?? null; }

export function editValue(text, key, raw) {
  if (raw !== null) JSON.parse(raw); // the managed values are JSON scalars
  const { properties, close } = inspect(text);
  const entry = properties.get(key);
  let result = text;
  if (entry && raw !== null) result = text.slice(0, entry.start) + raw + text.slice(entry.end);
  else if (entry) {
    const entries = [...properties.values()];
    const previous = entries[entries.indexOf(entry) - 1];
    result = text.slice(0, entry.keyStart) + text.slice(entry.comma?.end ?? entry.end);
    if (!entry.comma && previous?.comma) result = result.slice(0, previous.comma.start) + result.slice(previous.comma.end);
  } else if (raw !== null) {
    const newline = text.includes('\r\n') ? '\r\n' : '\n';
    result = text.slice(0, close) + `${newline}  ${JSON.stringify(key)}: ${raw}${newline}` + text.slice(close);
    const last = [...properties.values()].at(-1);
    if (last && !last.comma) result = result.slice(0, last.end) + ',' + result.slice(last.end);
  }
  inspect(result);
  return result;
}

export function restoreValues(text, previous, applied) {
  let result = text;
  const conflicts = [];
  for (const [key, raw] of Object.entries(previous)) {
    const current = rawValue(result, key);
    // Preserve user edits made after mounting, including deleting a managed key.
    if (current !== (applied[key] ?? null) && current !== raw) { conflicts.push(key); continue; }
    result = editValue(result, key, raw);
  }
  return { text: result, conflicts };
}

function parseContent(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return value ?? null;

  const withoutFence = value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

  try {
    return JSON.parse(withoutFence);
  } catch {
    return value;
  }
}

return $input.all().map((item, index) => ({
  json: {
    content: parseContent(
      item.json?.choices?.[0]?.message?.content ?? null,
    ),
  },
  pairedItem: { item: index },
}));

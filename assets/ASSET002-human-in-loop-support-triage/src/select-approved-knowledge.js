const queryInput = $('Build Knowledge Query').first().json;
const query = queryInput.knowledge_query;
const rows = $input.all().map((item) => item.json);

const ranked = rows
  .filter((row) => row.approved === true && typeof row.content === 'string' && row.content.trim())
  .map((row) => {
    const haystack = `${row.title ?? ''} ${row.category ?? ''} ${row.keywords ?? ''} ${row.content}`.toLowerCase();
    const termScore = query.terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
    const categoryScore = row.category === query.category ? 5 : row.category === 'general' ? 1 : 0;
    return { row, score: termScore + categoryScore };
  })
  .filter((entry) => entry.score > 0)
  .sort((a, b) => b.score - a.score || String(a.row.knowledge_id).localeCompare(String(b.row.knowledge_id)))
  .slice(0, 3)
  .map(({ row }) => ({
    knowledge_id: String(row.knowledge_id), title: String(row.title ?? ''),
    content: row.content.slice(0, 5000), source_url: row.source_url ? String(row.source_url) : null,
  }));

return [{ json: { response_input: queryInput.response_input, knowledge: ranked, knowledge_found: ranked.length > 0 } }];

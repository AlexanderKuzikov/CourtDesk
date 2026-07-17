import express from 'express';
import { loadConfig } from '../core/config.js';
import { classify } from '../intake/index.js';

const app = express();
const config = loadConfig();

app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

app.get('/api/config', (_req, res) => {
  res.json({ snifferUrl: config.snifferUrl, flowUrl: config.flowUrl, port: config.port });
});

// Intake — классификация запроса
app.post('/api/intake', (req, res) => {
  const { input, courtId, courtType } = req.body;
  if (!input || typeof input !== 'string') {
    return res.status(400).json({ error: 'input обязателен' });
  }
  const result = classify(input);
  res.json({ input, classification: result, suggested: suggestAfter(result) });
});

// Search — прокси к CourtSniffer
app.post('/api/search', async (req, res) => {
  const { courtId, courtType, caseNumber, defendant, plaintiff } = req.body;
  if (!courtId || (!caseNumber && !defendant && !plaintiff)) {
    return res.status(400).json({ error: 'courtId + caseNumber или defendant/plaintiff обязательны' });
  }
  try {
    const body = caseNumber
      ? { courtId, courtType, caseNumber }
      : { courtId, courtType, defendant, plaintiff };
    const snifferRes = await fetch(`${config.snifferUrl}/api/search/case-number`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });
    if (!snifferRes.ok) {
      return res.status(502).json({ error: `Sniffer error: HTTP ${snifferRes.status}` });
    }
    const data = await snifferRes.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Sniffer unavailable' });
  }
});

// Monitor — добавить дело в CourtFlow
app.post('/api/monitor', async (req, res) => {
  const { url, courtId, courtType } = req.body;
  if (!url || !courtId || !courtType) {
    return res.status(400).json({ error: 'url, courtId, courtType обязательны' });
  }
  try {
    const flowRes = await fetch(`${config.flowUrl}/api/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, courtId, courtType }),
      signal: AbortSignal.timeout(5000),
    });
    if (!flowRes.ok) {
      return res.status(502).json({ error: `Flow error: HTTP ${flowRes.status}` });
    }
    const data = await flowRes.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Flow unavailable' });
  }
});

app.listen(config.port, () => {
  console.log(`[courtdesk] Server: http://127.0.0.1:${config.port}`);
});

function suggestAfter(result: import('../intake/index.js').Classification): string[] {
  if (result.type === 'case_card') return ['monitor', 'notify_on_change'];
  if (result.type === 'search') return ['select_court', 'run_search'];
  return ['check_input'];
}

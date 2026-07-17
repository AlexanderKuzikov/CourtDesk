import express from 'express';
import { loadConfig } from '../core/config.js';

const app = express();
const config = loadConfig();

app.use(express.json());

// Health
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

// Config (safe)
app.get('/api/config', (_req, res) => {
  res.json({
    snifferUrl: config.snifferUrl,
    flowUrl: config.flowUrl,
    port: config.port,
  });
});

// Search — прокси к CourtSniffer
app.post('/api/search', async (req, res) => {
  const { courtId, courtType, caseNumber, defendant, plaintiff } = req.body;
  if (!courtId || (!caseNumber && !defendant && !plaintiff)) {
    return res.status(400).json({ error: 'courtId + caseNumber или defendant/plaintiff обязательны' });
  }
  try {
    const snifferRes = await fetch(`${config.snifferUrl}/api/search/case-number`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courtId, courtType, caseNumber }),
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
  const { url, courtId, courtType, caseNumber } = req.body;
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

// Start
app.listen(config.port, () => {
  console.log(`[courtdesk] Server: http://127.0.0.1:${config.port}`);
});

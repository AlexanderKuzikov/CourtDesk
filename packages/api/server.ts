// API-сервер CourtDesk
// Фаза 1: заглушка, будет расширяться по мере реализации модулей
import express from 'express';

const PORT = Number(process.env['PORT']) || 8767;

const app = express();
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', version: '0.1.0' } });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[courtdesk] API: http://127.0.0.1:${PORT}`);
});

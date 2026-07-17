export interface Config {
  snifferUrl: string;
  flowUrl: string;
  databasePath: string;
  port: number;
  captcha: {
    apiKey: string;
    fallbackApiKey: string;
  };
}

export function loadConfig(): Config {
  try {
    process.loadEnvFile();
  } catch {}

  return {
    snifferUrl: process.env.SNIFFER_URL ?? 'http://127.0.0.1:8765',
    flowUrl: process.env.FLOW_URL ?? 'http://127.0.0.1:8766',
    databasePath: process.env.DATABASE_PATH ?? './data/courtdesk.db',
    port: parseInt(process.env.PORT ?? '8767', 10),
    captcha: {
      apiKey: process.env.RUCAPTCHA_API_KEY ?? '',
      fallbackApiKey: process.env.RUCAPTCHA_FALLBACK_API_KEY ?? '',
    },
  };
}

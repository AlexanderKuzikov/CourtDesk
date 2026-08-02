// packages/captcha/rucaptcha.ts
// RuCaptcha API v2 (api.rucaptcha.com) — createTask / getTaskResult
// Docs: https://rucaptcha.com/api-docs/normal-captcha

import logger from '../core/logger.js';

const API_BASE = 'https://api.rucaptcha.com';
const NETWORK_RETRY_LIMIT = 2;

export interface RuCaptchaClientOptions {
  apiKey: string;
  softId?: string;
  pollingIntervalMs?: number;
  timeoutMs?: number;
}

export class RuCaptchaClient {
  private readonly apiKey: string;
  private readonly softId: string;
  private readonly pollingIntervalMs: number;
  private readonly timeoutMs: number;

  constructor(options: RuCaptchaClientOptions) {
    this.apiKey = options.apiKey;
    this.softId = options.softId ?? '';
    this.pollingIntervalMs = options.pollingIntervalMs ?? 5000;
    this.timeoutMs = options.timeoutMs ?? 120000;
  }

  async solveImage(imageBase64: string): Promise<string> {
    const taskId = await this.createTask(imageBase64);
    const result = await this.pollResult(taskId);
    // CR11-012 FIXED: не логируем сам результат капчи
    logger.debug({ taskId }, '[rucaptcha] captcha solved');
    return result;
  }

  private async createTask(imageBase64: string): Promise<number> {
    const res = await fetch(`${API_BASE}/createTask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clientKey: this.apiKey,
        task: {
          type: 'ImageToTextTask',
          body: imageBase64,
          numeric: 1,
          minLength: 4,
          maxLength: 6,
          ...(this.softId ? { softId: this.softId } : {}),
        },
      }),
    });
    const json = await res.json() as { errorId: number; errorCode?: string; taskId?: number };
    if (json.errorId !== 0) {
      throw new Error(`RuCaptcha createTask error: ${json.errorCode ?? json.errorId}`);
    }
    if (!json.taskId) {
      throw new Error('RuCaptcha createTask: нет taskId в ответе');
    }
    return json.taskId;
  }

  // CR5-006 FIXED: retry при network error в polling (до NETWORK_RETRY_LIMIT попыток)
  // Не сбрасывает общий таймаут — retry считается в рамках timeoutMs.
  private async pollResult(taskId: number): Promise<string> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < this.timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, this.pollingIntervalMs));

      let json: { errorId: number; errorCode?: string; status: 'processing' | 'ready'; solution?: { text: string } };

      let networkAttempt = 0;
      while (true) {
        try {
          const res = await fetch(`${API_BASE}/getTaskResult`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ clientKey: this.apiKey, taskId }),
          });
          json = await res.json() as typeof json;
          break;
        } catch (networkErr) {
          networkAttempt++;
          if (networkAttempt > NETWORK_RETRY_LIMIT) {
            throw new Error(`RuCaptcha network error after ${NETWORK_RETRY_LIMIT} retries: ${String(networkErr)}`);
          }
          // Короткая пауза перед retry — не полный pollingInterval
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      if (json.errorId !== 0) {
        throw new Error(`RuCaptcha getTaskResult error: ${json.errorCode ?? json.errorId}`);
      }
      if (json.status === 'processing') continue;
      if (json.status === 'ready') {
        if (!json.solution?.text) {
          throw new Error('RuCaptcha: статус ready, но solution.text отсутствует');
        }
        return json.solution.text;
      }
      throw new Error(`RuCaptcha: неожиданный статус: ${json.status}`);
    }

    throw new Error('RuCaptcha timeout');
  }
}

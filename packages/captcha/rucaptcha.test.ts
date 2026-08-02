import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RuCaptchaClient } from './rucaptcha.js';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('RuCaptchaClient — API v2', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('полный цикл: createTask → ready', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ errorId: 0, taskId: 42 }))
      .mockResolvedValueOnce(jsonResponse({ errorId: 0, status: 'ready', solution: { text: '1234' } }));

    const client = new RuCaptchaClient({ apiKey: 'key', pollingIntervalMs: 1, timeoutMs: 5000 });
    const result = await client.solveImage('base64img');
    expect(result).toBe('1234');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [createUrl] = fetchMock.mock.calls[0]!;
    expect(createUrl).toContain('/createTask');
    const [pollUrl] = fetchMock.mock.calls[1]!;
    expect(pollUrl).toContain('/getTaskResult');
  });

  it('createTask с ошибкой — throw с errorCode', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ errorId: 12, errorCode: 'ERROR_WRONG_USER_KEY' }));
    const client = new RuCaptchaClient({ apiKey: 'bad', pollingIntervalMs: 1 });
    await expect(client.solveImage('img')).rejects.toThrow('ERROR_WRONG_USER_KEY');
  });

  it('createTask без taskId — throw', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ errorId: 0 }));
    const client = new RuCaptchaClient({ apiKey: 'key', pollingIntervalMs: 1 });
    await expect(client.solveImage('img')).rejects.toThrow('нет taskId');
  });

  it('polling: processing → ready', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ errorId: 0, taskId: 7 }))
      .mockResolvedValueOnce(jsonResponse({ errorId: 0, status: 'processing' }))
      .mockResolvedValueOnce(jsonResponse({ errorId: 0, status: 'ready', solution: { text: 'abcd' } }));
    const client = new RuCaptchaClient({ apiKey: 'key', pollingIntervalMs: 1, timeoutMs: 5000 });
    await expect(client.solveImage('img')).resolves.toBe('abcd');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('ready без solution.text — throw', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ errorId: 0, taskId: 7 }))
      .mockResolvedValueOnce(jsonResponse({ errorId: 0, status: 'ready' }));
    const client = new RuCaptchaClient({ apiKey: 'key', pollingIntervalMs: 1, timeoutMs: 5000 });
    await expect(client.solveImage('img')).rejects.toThrow('solution.text отсутствует');
  });

  it('ошибка getTaskResult — throw', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ errorId: 0, taskId: 7 }))
      .mockResolvedValueOnce(jsonResponse({ errorId: 11, errorCode: 'ERROR_CAPTCHA_NOT_FOUND' }));
    const client = new RuCaptchaClient({ apiKey: 'key', pollingIntervalMs: 1, timeoutMs: 5000 });
    await expect(client.solveImage('img')).rejects.toThrow('ERROR_CAPTCHA_NOT_FOUND');
  });

  it('CR5-006: network retry в polling, затем успех', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ errorId: 0, taskId: 7 }))
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(jsonResponse({ errorId: 0, status: 'ready', solution: { text: 'x1y2' } }));
    const client = new RuCaptchaClient({ apiKey: 'key', pollingIntervalMs: 1, timeoutMs: 10000 });
    await expect(client.solveImage('img')).resolves.toBe('x1y2');
  });

  it('network error сверх лимита retry — throw', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ errorId: 0, taskId: 7 }))
      .mockRejectedValue(new Error('ECONNRESET'));
    const client = new RuCaptchaClient({ apiKey: 'key', pollingIntervalMs: 1, timeoutMs: 10000 });
    await expect(client.solveImage('img')).rejects.toThrow(/network error after 2 retries/);
  });

  it('таймаут polling — throw', async () => {
    // mockImplementation — новый Response на каждый вызов (у Response тело одноразовое)
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/createTask')) return jsonResponse({ errorId: 0, taskId: 7 });
      return jsonResponse({ errorId: 0, status: 'processing' });
    });
    const client = new RuCaptchaClient({ apiKey: 'key', pollingIntervalMs: 5, timeoutMs: 30 });
    await expect(client.solveImage('img')).rejects.toThrow('RuCaptcha timeout');
  });
});

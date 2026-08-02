import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function makeFakeBrowser() {
  return { connected: true, close: vi.fn(async () => {}) };
}

const launchMock = vi.fn();

vi.mock('puppeteer', () => ({ default: { launch: launchMock } }));

describe('captcha/browser — пул браузера (CR12-009)', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    launchMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function freshModule() {
    return import('./browser.js');
  }

  it('один браузер на несколько последовательных вызовов', async () => {
    const b = makeFakeBrowser();
    launchMock.mockResolvedValue(b);
    const { getBrowser, releaseBrowser } = await freshModule();

    const b1 = await getBrowser();
    releaseBrowser();
    const b2 = await getBrowser();
    releaseBrowser();

    expect(launchMock).toHaveBeenCalledTimes(1);
    expect(b1).toBe(b);
    expect(b2).toBe(b);
  });

  it('параллельные getBrowser не запускают два браузера', async () => {
    const b = makeFakeBrowser();
    // без setTimeout — в тесте fake timers
    launchMock.mockImplementation(() => Promise.resolve(b));
    const { getBrowser } = await freshModule();

    const [b1, b2, b3] = await Promise.all([getBrowser(), getBrowser(), getBrowser()]);
    expect(launchMock).toHaveBeenCalledTimes(1);
    expect(b1).toBe(b2);
    expect(b2).toBe(b3);
  });

  it('после простоя браузер закрывается', async () => {
    const b = makeFakeBrowser();
    launchMock.mockResolvedValue(b);
    const { getBrowser, releaseBrowser } = await freshModule();

    await getBrowser();
    releaseBrowser();
    expect(b.close).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(31_000);
    expect(b.close).toHaveBeenCalledTimes(1);
  });

  it('новый вызов в пределах простоя отменяет закрытие', async () => {
    const b = makeFakeBrowser();
    launchMock.mockResolvedValue(b);
    const { getBrowser, releaseBrowser } = await freshModule();

    await getBrowser();
    releaseBrowser();
    await vi.advanceTimersByTimeAsync(10_000);
    const b2 = await getBrowser();
    await vi.advanceTimersByTimeAsync(31_000);

    expect(b2).toBe(b);
    expect(b.close).not.toHaveBeenCalled();
    expect(launchMock).toHaveBeenCalledTimes(1);
  });

  it('отвалившийся браузер перезапускается', async () => {
    const b1 = makeFakeBrowser();
    const b2 = makeFakeBrowser();
    launchMock.mockResolvedValueOnce(b1).mockResolvedValueOnce(b2);
    const { getBrowser } = await freshModule();

    await getBrowser();
    b1.connected = false; // браузер умер между вызовами
    const got = await getBrowser();

    expect(launchMock).toHaveBeenCalledTimes(2);
    expect(got).toBe(b2);
  });

  it('closeBrowser закрывает сразу', async () => {
    const b = makeFakeBrowser();
    launchMock.mockResolvedValue(b);
    const { getBrowser, closeBrowser } = await freshModule();

    await getBrowser();
    await closeBrowser();
    expect(b.close).toHaveBeenCalledTimes(1);
  });

  it('ошибка launch не ломает повторную попытку', async () => {
    const b = makeFakeBrowser();
    launchMock.mockRejectedValueOnce(new Error('chrome not found')).mockResolvedValueOnce(b);
    const { getBrowser } = await freshModule();

    await expect(getBrowser()).rejects.toThrow('chrome not found');
    await expect(getBrowser()).resolves.toBe(b);
    expect(launchMock).toHaveBeenCalledTimes(2);
  });
});

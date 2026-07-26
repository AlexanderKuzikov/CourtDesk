export interface ScanProgress {
  running: boolean;
  total: number;
  processed: number;
  errors: number;
}

let _progress: ScanProgress = { running: false, total: 0, processed: 0, errors: 0 };

export function getProgress(): ScanProgress {
  return _progress;
}

export function setProgress(p: Partial<ScanProgress>): void {
  _progress = { ..._progress, ...p };
}

export function resetProgress(): void {
  _progress = { running: false, total: 0, processed: 0, errors: 0 };
}

export function quotaSnapshot(data, updatedAt = Date.now()) {
  const windows = [data?.rate_limit?.primary_window, data?.rate_limit?.secondary_window]
    .filter(w => w && Number.isFinite(w.used_percent))
    .map(w => ({
      remaining: Math.max(0, Math.min(100, 100 - w.used_percent)),
      seconds: Number.isFinite(w.limit_window_seconds) ? w.limit_window_seconds : null,
      resetAt: Number.isFinite(w.reset_at) ? w.reset_at * 1000 : null
    }));
  return {updatedAt, windows};
}

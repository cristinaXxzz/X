const DEFAULT_WORKER_URL = 'https://sullyos-worker.cristinazhou0122.workers.dev';
const PUSH_ENDPOINT_STORAGE_KEY = 'proactive_push_endpoint_v1';

const normalizeWorkerUrl = (url: string): string => url.trim().replace(/\/+$/, '');

export const getProxyWorkerUrl = (): string => {
    try {
        const raw = localStorage.getItem(PUSH_ENDPOINT_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as { workerUrl?: string };
            const saved = normalizeWorkerUrl(parsed.workerUrl || '');
            if (saved.startsWith('https://')) return saved;
        }
    } catch {
        // Ignore localStorage/JSON failures and use the personal default.
    }
    return DEFAULT_WORKER_URL;
};


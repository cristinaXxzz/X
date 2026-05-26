const DEFAULT_WORKER_URL = 'https://sullyos-worker.cristinazhou0122.workers.dev';

const normalizeWorkerUrl = (url: string): string => url.trim().replace(/\/+$/, '');

export const getProxyWorkerUrl = (): string => {
    return normalizeWorkerUrl(DEFAULT_WORKER_URL);
};

const JOB_REQUEST_VERSION = 'l7.worker.job-request/1.0';
const SHA256 = /^[a-f0-9]{64}$/;

export class L7ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'L7ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class L7Client {
  constructor(baseUrl, options = {}) {
    if (!baseUrl) throw new TypeError('baseUrl is required');
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.fetch = options.fetch || globalThis.fetch;
    if (typeof this.fetch !== 'function') throw new TypeError('fetch implementation is required');
    this.credentials = options.credentials || 'include';
    this.headers = { ...options.headers };
  }

  async capabilities() {
    return this.#request('/v1/capabilities', {}, value => value);
  }

  async listJobs() {
    return this.#request('/v1/jobs', {}, value => value.jobs);
  }

  async submitJob(request) {
    const requestId = request.request_id || `request:${globalThis.crypto.randomUUID()}`;
    const publicRequest = { ...request };
    delete publicRequest.tenant_id;
    return this.#request('/v1/jobs', {
      method: 'POST',
      body: JSON.stringify({ ...publicRequest, contract_version: JOB_REQUEST_VERSION, request_id: requestId }),
    }, value => value.job);
  }

  async getJob(jobId) {
    return this.#request(`/v1/jobs/${encodeURIComponent(jobId)}`, {}, value => value.job);
  }

  async cancelJob(jobId) {
    return this.#request(`/v1/jobs/${encodeURIComponent(jobId)}/cancel`, {
      method: 'POST', body: '{}',
    }, value => value.job);
  }

  artifactUrl(sha256) {
    if (!SHA256.test(sha256)) throw new TypeError('artifact sha256 is invalid');
    return `${this.baseUrl}/v1/artifacts/${sha256}`;
  }

  async #request(path, init, select) {
    const response = await this.fetch(`${this.baseUrl}${path}`, {
      credentials: this.credentials,
      ...init,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...this.headers },
    });
    let envelope;
    try {
      envelope = await response.json();
    } catch {
      throw new L7ApiError(response.status, 'INVALID_RESPONSE', 'L7 returned invalid JSON', null);
    }
    if (!response.ok || envelope?.success !== true) {
      throw new L7ApiError(
        response.status,
        envelope?.meta?.error_code || 'REQUEST_FAILED',
        envelope?.error || `L7 request failed with status ${response.status}`,
        envelope,
      );
    }
    return select(envelope.result);
  }
}

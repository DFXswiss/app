const DEFAULT_API_ORIGIN = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(message, { status = 0, path = '' } = {}) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
    this.path = path;
  }
}

function apiUrl(target, apiOrigin) {
  if (apiOrigin !== DEFAULT_API_ORIGIN) {
    throw new GitHubError(`refusing non-GitHub API URL: ${apiOrigin}`, { path: target });
  }
  const url = target.startsWith('https://') ? new URL(target) : new URL(target, DEFAULT_API_ORIGIN);
  if (url.protocol !== 'https:' || url.origin !== DEFAULT_API_ORIGIN) {
    throw new GitHubError(`refusing non-GitHub API URL: ${url.origin}`, { path: target });
  }
  return url;
}

function nextLink(header) {
  if (typeof header !== 'string' || !header) {
    return null;
  }
  for (const part of header.split(',')) {
    if (!/rel="?next"?/.test(part)) {
      continue;
    }
    const match = /<([^>]+)>/.exec(part);
    if (match) {
      return match[1];
    }
  }
  return null;
}

function errorMessage(data, fallback) {
  if (data && typeof data === 'object' && typeof data.message === 'string' && data.message) {
    return data.message;
  }
  return fallback;
}

export class GitHubClient {
  constructor({ token, fetchImpl = globalThis.fetch, apiOrigin = DEFAULT_API_ORIGIN } = {}) {
    if (typeof token !== 'string' || !token) {
      throw new GitHubError('GitHub token unavailable');
    }
    if (typeof fetchImpl !== 'function') {
      throw new GitHubError('fetch unavailable');
    }
    this.token = token;
    this.fetchImpl = fetchImpl;
    this.apiOrigin = apiOrigin;
  }

  async request(target, { method = 'GET', body, accept = 'application/vnd.github+json' } = {}) {
    const url = apiUrl(target, this.apiOrigin);
    const headers = {
      Accept: accept,
      Authorization: `Bearer ${this.token}`,
      'User-Agent': 'dfx-e2e-pairing/1',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    const options = { method: method.toUpperCase(), headers, redirect: 'error' };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const response = await this.fetchImpl(url.toString(), options);
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (!response.ok) {
      throw new GitHubError(
        `GitHub API ${method.toUpperCase()} ${url.pathname} failed (${response.status}): ${errorMessage(
          data,
          'request failed',
        )}`,
        { status: response.status, path: url.pathname },
      );
    }
    return { status: response.status, data, headers: response.headers };
  }

  async getJson(target, options = {}) {
    return (await this.request(target, options)).data;
  }

  async getOptional(target) {
    try {
      return await this.request(target);
    } catch (error) {
      if (error instanceof GitHubError && error.status === 404) {
        return { status: 404, data: null, headers: null };
      }
      throw error;
    }
  }

  async paginate(target, { maxPages = 100, maxItems = 10000 } = {}) {
    const items = [];
    let next = target;
    let pages = 0;
    while (next) {
      pages += 1;
      if (pages > maxPages) {
        throw new GitHubError('GitHub API pagination exceeded the page bound', { path: target });
      }
      const response = await this.request(next);
      if (!Array.isArray(response.data)) {
        throw new GitHubError('GitHub API pagination response is not an array', { path: target });
      }
      items.push(...response.data);
      if (items.length > maxItems) {
        throw new GitHubError('GitHub API pagination exceeded the item bound', { path: target });
      }
      next = nextLink(response.headers?.get?.('link'));
    }
    return items;
  }

  async paginateList(target, key, { maxPages = 100, maxItems = 10000 } = {}) {
    const items = [];
    let next = target;
    let pages = 0;
    while (next) {
      pages += 1;
      if (pages > maxPages) {
        throw new GitHubError('GitHub API pagination exceeded the page bound', { path: target });
      }
      const response = await this.request(next);
      const page = response.data && typeof response.data === 'object' ? response.data[key] : null;
      if (!Array.isArray(page)) {
        throw new GitHubError(`GitHub API pagination response has no ${key} array`, { path: target });
      }
      items.push(...page);
      if (items.length > maxItems) {
        throw new GitHubError('GitHub API pagination exceeded the item bound', { path: target });
      }
      next = nextLink(response.headers?.get?.('link'));
    }
    return items;
  }

  async getContentJson(repo, path, ref) {
    const response = await this.getOptional(
      `/repos/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`,
    );
    if (response.status === 404) {
      return null;
    }
    const data = response.data;
    if (!data || typeof data !== 'object' || data.encoding !== 'base64' || typeof data.content !== 'string') {
      throw new GitHubError(`contents response for ${path} is invalid`, { path });
    }
    return Buffer.from(data.content.replace(/\s+/g, ''), 'base64').toString('utf8');
  }

  async postStatus(repo, sha, { state, context, description, targetUrl }) {
    return this.getJson(`/repos/${repo}/statuses/${sha}`, {
      method: 'POST',
      body: { state, context, description, target_url: targetUrl },
    });
  }

  async postRerun(repo, jobId) {
    return this.getJson(`/repos/${repo}/actions/jobs/${jobId}/rerun`, {
      method: 'POST',
    });
  }

  async cancelRun(repo, runId) {
    return this.getJson(`/repos/${repo}/actions/runs/${runId}/cancel`, {
      method: 'POST',
    });
  }
}

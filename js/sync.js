// GitHub Contents API client. Talks ONLY to api.github.com, using a fine-grained token
// that can read/write one private data repo. The token never leaves this device except to GitHub.
const API = 'https://api.github.com';

export class SyncError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

const b64encode = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const b64decode = (b64) => {
  const bin = atob(b64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

export function makeClient({ owner, repo, token }) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const base = `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  async function call(url, opts = {}) {
    let res;
    try { res = await fetch(url, { ...opts, headers: { ...headers, ...(opts.headers || {}) }, cache: 'no-store' }); }
    catch (e) { throw new SyncError('Network unavailable', 0); }
    if (res.status === 401) throw new SyncError('Token invalid or expired', 401);
    if (res.status === 403) throw new SyncError('Token lacks permission (needs Contents: Read and write on the data repo)', 403);
    return res;
  }

  return {
    async testConnection() {
      const res = await call(base);
      if (res.status === 404) throw new SyncError('Repository not found (check owner/repo, and that the token includes it)', 404);
      if (!res.ok) throw new SyncError(`GitHub error ${res.status}`, res.status);
      const j = await res.json();
      return { private: j.private, canPush: !!j.permissions?.push, fullName: j.full_name };
    },
    async getFile(path) {
      const res = await call(`${base}/contents/${path}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new SyncError(`Read ${path} failed (${res.status})`, res.status);
      const j = await res.json();
      let text;
      if (j.content) text = b64decode(j.content);
      else { // > 1 MB: fetch raw
        const raw = await call(`${base}/contents/${path}`, { headers: { Accept: 'application/vnd.github.raw' } });
        text = await raw.text();
      }
      return { json: JSON.parse(text), sha: j.sha };
    },
    async putFile(path, json, sha, message) {
      const body = { message, content: b64encode(JSON.stringify(json, null, 1)) };
      if (sha) body.sha = sha;
      const res = await call(`${base}/contents/${path}`, { method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
      if (res.status === 409 || res.status === 422) throw new SyncError('conflict', 409);
      if (!res.ok) throw new SyncError(`Write ${path} failed (${res.status})`, res.status);
      const j = await res.json();
      return j.content.sha;
    },
    async listDir(path) {
      const res = await call(`${base}/contents/${path}`);
      if (res.status === 404) return [];
      if (!res.ok) throw new SyncError(`List ${path} failed (${res.status})`, res.status);
      const j = await res.json();
      return Array.isArray(j) ? j.map((x) => x.name) : [];
    },
  };
}

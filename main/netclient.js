/**
 * Pharmco Network Client
 * Used by User PCs to communicate with the Admin PC server.
 * Wraps all fetch() calls so the rest of main.js looks identical
 * whether running in LOCAL or NETWORK mode.
 */

const fetch = require('node-fetch');

let _base = '';   // e.g. "http://192.168.1.10:7272"

function setBase(url) { _base = url.replace(/\/$/, ''); }
function getBase() { return _base; }

async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${_base}${path}`, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return res.json();
}

const get  = (path)       => api('GET',    path);
const post = (path, body) => api('POST',   path, body);
const put  = (path, body) => api('PUT',    path, body);
const del  = (path)       => api('DELETE', path);

// Test connectivity — resolves true/false
async function ping(url) {
  try {
    const base = (url || _base).replace(/\/$/, '');
    const res = await fetch(`${base}/api/ping`, { timeout: 3000 });
    const data = await res.json();
    return data.ok === true;
  } catch { return false; }
}

module.exports = { setBase, getBase, ping, get, post, put, del };

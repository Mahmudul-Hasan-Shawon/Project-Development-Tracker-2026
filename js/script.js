/**
 * Project & Development Tracker - single-file frontend (script.js)
 *
 * This is the complete client. Load index.html->/js/script.js via type="module".
 *
 * The ONLY line you normally touch is API_URL just below.
 * Those .gs files are your backend - paste apps-script/Code.gs as-is into
 * Apps Script. In the Apps Script UI: Deploy->New deployment->Web app->Execute
 * as Me->Who has access: Anyone->Deploy, then copy that /exec URL here.
 *
 * NOTE: that /exec URL is public. Anyone who views this page's source can see
 * it, so it does not hide anything - the login *inside* the API is what
 * protects the data, never the URL itself.
 */

/* =========================================================================
 * CONFIG - EDIT THIS
 * ========================================================================= */

/** Your Apps Script web app URL. Ends with /exec (never /dev). */
const API_URL = 'https://script.google.com/macros/s/AKfycbyvznBM7Ph9y_21nXQfCGRfarRvoRhG3N3qLsJKlMbFZTJ-S_nFG31806f0C0O9Vh4F/exec';

/** Rarely need to change these. */
const CONFIG = {
  APP_NAME: 'Project & Development Tracker',
  TIMEOUT_MS: 45000,
  TOKEN_KEY: 'pdt.token',
  BUILD: '2026.09.02'
};

/* ------------------------------------------------------------------ theme */

const THEME_KEY = 'pdt.theme';
function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}
function systemTheme() {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
const ICO_SUN = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
const ICO_MOON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
function applyTheme(t) {
  const dark = t !== 'light';
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const btn = $('#themeBtn');
  if (btn) {
    btn.innerHTML = (dark ? ICO_SUN : ICO_MOON) +
      `<span class="lbl">${dark ? 'Light' : 'Dark'}</span>`;
    btn.title = dark ? 'Switch to light theme' : 'Switch to dark theme';
  }
  const btnM = $('#themeBtnMobile');
  if (btnM) {
    btnM.innerHTML = (dark ? ICO_SUN : ICO_MOON) +
      `<span class="lbl">${dark ? 'Light' : 'Dark'}</span>`;
    btnM.title = dark ? 'Switch to light theme' : 'Switch to dark theme';
  }
}
function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch { /* private browsing */ }
  applyTheme(saved === 'light' || saved === 'dark' ? saved : systemTheme());
}
function toggleTheme() {
  const next = currentTheme() === 'light' ? 'dark' : 'light';
  applyTheme(next);
  try { localStorage.setItem(THEME_KEY, next); } catch { /* private browsing */ }
}

/* =========================================================================
 * API LAYER
 * ========================================================================= *//**
 * api.js — the only place that talks to Apps Script.
 *
 * Every call is a POST to the /exec URL with a JSON body sent as
 * "text/plain;charset=utf-8". That content type is CORS-safelisted, so the
 * browser sends the request straight through with no preflight. Switching it
 * to "application/json", or adding any custom header such as Authorization,
 * makes the browser fire an OPTIONS preflight first — and Apps Script cannot
 * answer one, so the call dies with an unhelpful "CORS policy" error.
 *
 * The session token therefore lives in the request body, not a header.
 */
class ApiError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ApiError';
    this.code = code || 'ERROR';
  }
}

/* ------------------------------------------------------------------ token */

let token = null;
function loadToken() {
  try { token = localStorage.getItem(CONFIG.TOKEN_KEY); } catch { token = null; }
  return token;
}
function setToken(value) {
  token = value || null;
  try {
    if (token) localStorage.setItem(CONFIG.TOKEN_KEY, token);
    else localStorage.removeItem(CONFIG.TOKEN_KEY);
  } catch { /* private browsing — the token stays in memory only */ }
}
function getToken() { return token; }

/* ------------------------------------------------------------------- call */

/**
 * Fires when the server rejects the token. app.js listens and drops the
 * user back to the login screen.
 */
function signalAuthLoss() {
  window.dispatchEvent(new CustomEvent('pdt:auth-required'));
}

/**
 * @param {string} action  a key in the ROUTES map in Code.gs
 * @param {object} payload arguments for that action
 * @param {object} opts    { auth: false } for login / ping
 */
async function call(action, payload = {}, opts = {}) {
  if (!API_URL || API_URL === '' /* not used - API_URL above */) {
    throw new ApiError(
      'Set the API_URL line at the top of script.js.',
      'NO_CONFIG'
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);

  let response;
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      // must stay text/plain — see the note at the top of this file
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action,
        token: opts.auth === false ? '' : (token || ''),
        payload
      }),
      redirect: 'follow',
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new ApiError('The API did not respond in time. Try again.', 'TIMEOUT');
    }
    throw new ApiError(
      'Could not reach the API. Check that the deployment URL is correct and ' +
      'that the web app is deployed with access set to "Anyone".',
      'NETWORK'
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new ApiError(`API returned HTTP ${response.status}.`, 'HTTP_' + response.status);
  }

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    // Almost always an Apps Script error page rendered as HTML.
    throw new ApiError(
      'The API returned something that was not JSON. This usually means the ' +
      'deployment URL points at /dev instead of /exec, or the script threw ' +
      'before it could reply.',
      'BAD_RESPONSE'
    );
  }

  if (!body.ok) {
    if (body.code === 'AUTH_REQUIRED') {
      setToken(null);
      signalAuthLoss();
    }
    throw new ApiError(body.error || 'The request failed.', body.code);
  }

  return body.data;
}

/* --------------------------------------------------------------- actions */
const Api = {
  ping:      ()                       => call('ping', {}, { auth: false }),
  login:     (username, password)     => call('login', { username, password }, { auth: false }),
  logout:    ()                       => call('logout'),
  changePassword: (current, next)     => call('changePassword', { current, next }),

  bootstrap: ()                       => call('bootstrap'),
  dashboard: ()                       => call('dashboard'),
  projects:  ()                       => call('projects'),
  project:   (projectId)              => call('project', { projectId }),

  save:      (table, record)          => call('save', { table, record }),
  remove:    (table, id)              => call('delete', { table, id }),
  setStatus: (projectId, field, value) => call('setStatus', { projectId, field, value })
};



/* =========================================================================
 * STATE  - cached data + helpers
 * ========================================================================= */
/**
 * state.js — everything the views read from.
 *
 * Deliberately a single mutable object rather than a store abstraction: the
 * app is small, and one obvious place to look beats indirection.
 */
const S = {
  /** From the bootstrap call: session, lists, schema, collaborators. */
  boot: null,

  /** collaborator_id -> collaborator record. */
  people: {},

  /** Cached view data. Cleared after any write so the next read refetches. */
  projects: [],
  dash: null,
  detail: null,

  activeTab: 'Tasks',

  filters: {
    q: '',
    status: '',
    category: '',
    health: '',
    archived: 'hide',
    sort: 'updated'
  }
};
function setBoot(boot) {
  S.boot = boot;
  S.people = {};
  (boot.collaborators || []).forEach((c) => { S.people[c.collaborator_id] = c; });
}
function clearCaches() {
  S.projects = [];
  S.dash = null;
  S.detail = null;
}
function resetAll() {
  S.boot = null;
  S.people = {};
  clearCaches();
  S.activeTab = 'Tasks';
}
function session() { return S.boot ? S.boot.session : null; }
function role() { return S.boot ? S.boot.session.role : 'Viewer'; }
function canEdit() { return role() !== 'Viewer'; }
function canDeleteProject() { return role() === 'Admin'; }
function person(id) { return S.people[id] || null; }
function personName(id) {
  const p = S.people[id];
  return p ? p.full_name : (id || '—');
}

/** The id column for a table, mirroring CFG in Code.gs. */
const ID_FIELD = {
  Projects: 'project_id',
  Links: 'link_id',
  Versions: 'version_id',
  Tasks: 'task_id',
  Issues: 'issue_id',
  Testing_Log: 'test_id',
  Collaborators: 'collaborator_id',
  Project_Team: 'assignment_id',
  Activity_Log: 'activity_id'
};
const TABLE_LABEL = {
  Links: 'Links',
  Versions: 'Versions',
  Tasks: 'Tasks',
  Issues: 'Issues',
  Testing_Log: 'Testing',
  Project_Team: 'Team',
  Activity_Log: 'Activity'
};

/** Columns each child table shows in its detail-view grid. */
const TABLE_COLS = {
  Links:        ['link_type', 'label', 'url', 'is_primary', 'added_on'],
  Versions:     ['version', 'release_date', 'change_type', 'status', 'summary', 'author_id'],
  Tasks:        ['title', 'status', 'priority', 'assignee_id', 'due_date', 'est_hours', 'actual_hours'],
  Issues:       ['title', 'severity', 'status', 'environment', 'reported_date', 'fixed_in_version'],
  Testing_Log:  ['test_date', 'version_tested', 'test_type', 'environment', 'result', 'tester_id', 'next_test_due'],
  Project_Team: ['collaborator_id', 'project_role', 'access_level', 'is_active', 'added_on']
};

/** How the project form is grouped. Fields not listed still render, ungrouped. */
const PROJECT_SECTIONS = [
  ['Identity',        ['project_id', 'project_name', 'category', 'platform', 'client', 'description']],
  ['State',           ['status', 'priority', 'health', 'progress_pct', 'current_version', 'test_status', 'is_archived']],
  ['People & dates',  ['owner_id', 'start_date', 'last_deployed', 'next_review_date']],
  ['Where it lives',  ['local_path', 'backup_path', 'repo_url', 'live_url', 'docs_url', 'credentials_ref']],
  ['Technical',       ['tech_stack', 'environment', 'hosting', 'database']],
  ['Meta',            ['tags', 'notes', 'created_at', 'updated_at']]
];


/* =========================================================================
 * UI  - dom, formatting, pills, modals
 * ========================================================================= */
/**
 * ui.js — formatting, badges, avatars, modals, toasts.
 * No fetching here, and no knowledge of routes.
 */


/* ------------------------------------------------------------------ dom */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
function setView(html) { $('#view').innerHTML = html; }
function loading() { setView('<div class="loading">loading</div>'); }

/* ------------------------------------------------------------- formatting */
const fmtDate = (v) => (v ? String(v).slice(0, 10) : '—');
const fmtWhen = (v) => (v ? String(v).slice(0, 16).replace('T', ' ') : '—');
const fmtNum = (v) => (v === '' || v === null || v === undefined ? '—' : v);
function humanize(field) {
  return String(field)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .replace(/\bId\b/, 'ID')
    .replace(/\bUrl\b/, 'URL')
    .replace(/\bPct\b/, '%');
}
function errText(err) {
  const m = err?.message || String(err || 'Something went wrong.');
  return m.replace(/^Error:\s*/, '');
}

/* ---------------------------------------------------------------- badges */

const TONE = {
  Live: 'p-green', Maintenance: 'p-teal', 'In Development': 'p-amber',
  Testing: 'p-violet', Planning: 'p-grey', Idea: 'p-grey',
  'On Hold': 'p-yellow', Deprecated: 'p-red', Archived: 'p-grey',

  'On Track': 'p-green', 'At Risk': 'p-yellow', Blocked: 'p-red', 'Not Started': 'p-grey',

  Critical: 'p-red', High: 'p-amber', Medium: 'p-yellow', Low: 'p-grey',

  Done: 'p-green', 'In Progress': 'p-amber', 'In Review': 'p-violet',
  'To Do': 'p-grey', Backlog: 'p-grey', Cancelled: 'p-grey',

  Open: 'p-red', Investigating: 'p-amber', Fixed: 'p-green',
  "Won't Fix": 'p-grey', Duplicate: 'p-grey', Closed: 'p-grey',

  Pass: 'p-green', Passed: 'p-green', Partial: 'p-yellow',
  Fail: 'p-red', Failed: 'p-red', 'Not Tested': 'p-grey',

  Yes: 'p-teal', No: 'p-grey', Active: 'p-green', Inactive: 'p-grey'
};
function pill(value, noDot = false) {
  if (value === '' || value === null || value === undefined) {
    return '<span class="faint">—</span>';
  }
  return `<span class="pill ${TONE[value] || 'p-grey'}${noDot ? ' no-dot' : ''}">${esc(value)}</span>`;
}

/* --------------------------------------------------------------- avatars */
function avatar(p, large = false) {
  if (!p) return '';
  const cls = 'avatar' + (large ? ' avatar-lg' : '');
  const name = p.full_name || p.name || '';
  const src = p.avatar_url || p.avatar;
  if (src) {
    // no inline onerror handler — CSP forbids it. A broken avatar URL just
    // renders as a blank circle, which is an acceptable failure mode.
    return `<img class="${cls}" src="${esc(src)}" alt="${esc(name)}" title="${esc(name)}" loading="lazy">`;
  }
  const init = esc((p.initials || name.slice(0, 2)).toUpperCase());
  return `<span class="${cls}" title="${esc(name)}">${init}</span>`;
}
function avatarStack(team) {
  if (!team?.length) return '<span class="faint mono" style="font-size:10.5px">no team</span>';
  let html = team.slice(0, 4).map((p) => avatar(p)).join('');
  if (team.length > 4) html += `<span class="avatar more">+${team.length - 4}</span>`;
  return `<span class="avatars">${html}</span>`;
}
function personCell(id) {
  const p = S.people[id];
  if (!p) return `<span class="faint">${esc(id || '—')}</span>`;
  return `<span style="display:flex;align-items:center;gap:7px">${avatar(p)}<span>${esc(p.full_name)}</span></span>`;
}
function normalizeUrl(url) {
  if (!url) return '';
  let u = url.trim();
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(u)) u = 'https://' + u;
  return u;
}
function link(url) {
  if (!url) return '';
  const u = normalizeUrl(url);
  return `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(url)}</a>`;
}
function dl(label, value, mono = false) {
  return `<div><div class="dt">${esc(label)}</div>
    <div class="dd${mono ? ' mono' : ''}">${value || '<span class="faint">—</span>'}</div></div>`;
}

/* ----------------------------------------------------------------- toast */

let toastTimer = null;
function toast(message, kind = '') {
  const el = $('#toast');
  el.textContent = message;
  el.className = `toast ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast hidden'; }, 3600);
}

/* ----------------------------------------------------------------- modal */
function openModal({ title, body, saveLabel = 'Save' }) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = body;
  $('#modalMsg').textContent = '';
  $('#modalSave').textContent = saveLabel;
  $('#modal').classList.remove('hidden');
  const first = $('#modalBody input:not([readonly]), #modalBody select, #modalBody textarea');
  if (first) setTimeout(() => first.focus(), 80);
}
function closeModal() { $('#modal').classList.add('hidden'); }
function modalMessage(text) { $('#modalMsg').textContent = text || ''; }

/* --------------------------------------------------------------- confirm */

let confirmFn = null;
function askConfirm(title, bodyHtml, onOk, okLabel = 'Delete') {
  $('#confirmTitle').textContent = title;
  $('#confirmBody').innerHTML = bodyHtml;
  $('#confirmOk').textContent = okLabel;
  confirmFn = onOk;
  $('#confirm').classList.remove('hidden');
}
function wireConfirm() {
  $('#confirmOk').addEventListener('click', () => {
    const fn = confirmFn;
    $('#confirm').classList.add('hidden');
    confirmFn = null;
    if (fn) fn();
  });
}


/* =========================================================================
 * VIEWS  - dashboard / projects / project screens
 * ========================================================================= */
/**
 * views.js — everything that produces HTML.
 *
 * Views read from state, call the API for their own data, and hand user
 * actions back to app.js through the functions exposed on window.PDT.
 */


/* =========================================================================
 * DASHBOARD
 * ========================================================================= */
async function viewDashboard() {
  if (S.dash) return renderDashboard();
  loading();
  try {
    S.dash = await Api.dashboard();
    renderDashboard();
  } catch (err) {
    setView(`<div class="empty"><p>${esc(errText(err))}</p></div>`);
  }
}

function renderDashboard() {
  const d = S.dash;
  const k = d.kpi;

  const kpis = [
    ['Projects', k.total, ''],
    ['Active', k.active, 'cool'],
    ['At risk', k.atRisk, k.atRisk ? 'warm' : ''],
    ['Open tasks', k.openTasks, ''],
    ['Overdue', k.overdueTasks, k.overdueTasks ? 'hot' : ''],
    ['Hours logged', k.hoursLogged, '']
  ];

  let html = `<div class="page-head">
      <div>
        <h1 class="page-title">Portfolio</h1>
        <p class="page-sub">Live snapshot across every project in the sheet.</p>
      </div>
      <div class="spacer"></div>
      ${canEdit() ? '<button class="btn btn-primary" data-act="new-project">+ New project</button>' : ''}
    </div>`;

  html += '<div class="kpi-grid">' + kpis.map((kp, i) => `
      <div class="kpi ${kp[2]}" style="animation-delay:${i * 22}ms">
        <div class="kpi-val">${esc(kp[1])}</div>
        <div class="kpi-label">${esc(kp[0])}</div>
      </div>`).join('') + '</div>';

  html += '<div class="cols">';

  /* needs attention */
  html += '<div class="panel"><p class="eyebrow">Needs attention</p>';
  if (!d.attention.length) {
    html += '<div class="empty" style="border:none;padding:26px"><p>Nothing flagged. All projects on track.</p></div>';
  } else {
    html += `<div class="table-wrap"><table class="stackable">
      <thead><tr><th>Project</th><th>Health</th><th>Overdue</th><th>Critical</th><th>Days since test</th></tr></thead>
      <tbody>` + d.attention.map((a) => `
        <tr style="cursor:pointer" data-act="open" data-id="${esc(a.project_id)}" data-label="Project">
          <td data-label="Project"><div class="cell-strong">${esc(a.project_name)}</div>
              <div class="cell-sub mono">${esc(a.project_id)}</div></td>
          <td data-label="Health">${pill(a.health)}</td>
          <td data-label="Overdue" class="num">${a.overdueTasks || '—'}</td>
          <td data-label="Critical" class="num">${a.criticalIssues || '—'}</td>
          <td data-label="Days since test" class="num">${fmtNum(a.daysSinceTest)}</td>
        </tr>`).join('') + '</tbody></table></div>';

    html += '<div class="child-cards">' + d.attention.map((a) => `
      <div class="cc" data-act="open" data-id="${esc(a.project_id)}">
        <div class="cc-top">
          <div>
            <div class="cc-id">${esc(a.project_id)}</div>
            <div class="cc-name">${esc(a.project_name)}</div>
          </div>
          ${pill(a.health)}
        </div>
        <div class="cc-body">
          <div class="cc-row"><span class="cc-k">Overdue</span><span class="cc-v num">${a.overdueTasks || '—'}</span></div>
          <div class="cc-row"><span class="cc-k">Critical</span><span class="cc-v num">${a.criticalIssues || '—'}</span></div>
          <div class="cc-row"><span class="cc-k">Days since test</span><span class="cc-v num">${fmtNum(a.daysSinceTest)}</span></div>
        </div>
      </div>`).join('') + '</div>';
  }
  html += '</div>';

  /* breakdown + feed */
  html += '<div style="display:flex;flex-direction:column;gap:16px">';

  const statuses = Object.keys(d.byStatus).sort();
  const maxS = Math.max(1, ...statuses.map((s) => d.byStatus[s]));
  html += '<div class="panel"><p class="eyebrow">By status</p><div class="bars">' +
    statuses.map((s) => `
      <div class="bar-row"><span>${esc(s)}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${Math.round(d.byStatus[s] / maxS * 100)}%"></span></span>
        <span class="bar-num">${d.byStatus[s]}</span></div>`).join('') +
    '</div></div>';

  html += '<div class="panel"><p class="eyebrow">Recent activity</p><div class="feed">' +
    (d.recent.length ? d.recent.map((a) => `
      <div class="feed-item"><span class="feed-dot"></span><div class="feed-main">
        <div class="feed-text">${esc(personName(a.user_id))} · ${esc(a.action)} ${esc(a.entity_type).toLowerCase()}
          <span class="mono faint">${esc(a.entity_id)}</span>
          ${a.field_changed ? ` — <span class="dim">${esc(a.field_changed)}</span>` : ''}</div>
        <div class="feed-meta">${fmtWhen(a.timestamp)}${a.project_id ? ' · ' + esc(a.project_id) : ''}</div>
      </div></div>`).join('')
      : '<div class="empty" style="border:none"><p>No activity logged yet.</p></div>') +
    '</div></div>';

  html += '</div></div>';
  setView(html);
}

/* =========================================================================
 * PROJECT LIST
 * ========================================================================= */
async function viewProjects() {
  if (S.projects.length) return renderProjects();
  loading();
  try {
    S.projects = await Api.projects();
    renderProjects();
  } catch (err) {
    setView(`<div class="empty"><p>${esc(errText(err))}</p></div>`);
  }
}

function filteredProjects() {
  const f = S.filters;
  const q = f.q.toLowerCase().trim();

  const rows = S.projects.filter((p) => {
    if (f.archived === 'hide' && String(p.is_archived) === 'Yes') return false;
    if (f.archived === 'only' && String(p.is_archived) !== 'Yes') return false;
    if (f.status && p.status !== f.status) return false;
    if (f.category && p.category !== f.category) return false;
    if (f.health && p.health !== f.health) return false;
    if (!q) return true;
    return [p.project_id, p.project_name, p.description, p.tags, p.tech_stack,
            p.local_path, p.client, p.current_version, p.category, p.hosting]
      .join(' ').toLowerCase().includes(q);
  });

  const weight = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  const sorters = {
    updated: (a, b) => String(b.updated_at).localeCompare(String(a.updated_at)),
    name: (a, b) => String(a.project_name).localeCompare(String(b.project_name)),
    priority: (a, b) => (weight[a.priority] ?? 9) - (weight[b.priority] ?? 9),
    risk: (a, b) => (b._roll.criticalIssues - a._roll.criticalIssues) ||
                    (b._roll.overdueTasks - a._roll.overdueTasks),
    tested: (a, b) => {
      const x = a._roll.daysSinceTest === '' ? 1e6 : a._roll.daysSinceTest;
      const y = b._roll.daysSinceTest === '' ? 1e6 : b._roll.daysSinceTest;
      return y - x;
    }
  };
  return rows.sort(sorters[f.sort] || sorters.updated);
}

function renderProjects() {
  const lists = S.boot.lists;
  const f = S.filters;
  const rows = filteredProjects();

  const opts = (arr, sel) => arr.map((v) =>
    `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(v)}</option>`).join('');

  let html = `<div class="page-head">
      <div>
        <h1 class="page-title">Projects</h1>
        <p class="page-sub">Every project, its state, and where it lives on disk.</p>
      </div>
      <div class="spacer"></div>
      ${canEdit() ? '<button class="btn btn-primary" data-act="new-project">+ New project</button>' : ''}
    </div>`;

  html += `<div class="toolbar">
      <div class="search"><input id="fq" type="search" placeholder="Search name, tags, stack, path, id…" value="${esc(f.q)}"></div>
      <select class="filter" id="fstatus"><option value="">All statuses</option>${opts(lists['Project Status'] || [], f.status)}</select>
      <select class="filter" id="fcat"><option value="">All categories</option>${opts(lists.Category || [], f.category)}</select>
      <select class="filter" id="fhealth"><option value="">Any health</option>${opts(lists.Health || [], f.health)}</select>
      <select class="filter" id="farch">
        <option value="hide"${f.archived === 'hide' ? ' selected' : ''}>Hide archived</option>
        <option value="all"${f.archived === 'all' ? ' selected' : ''}>Include archived</option>
        <option value="only"${f.archived === 'only' ? ' selected' : ''}>Archived only</option>
      </select>
      <select class="filter" id="fsort">
        ${['updated:Last updated', 'name:Name', 'priority:Priority', 'risk:Risk', 'tested:Least recently tested']
          .map((o) => {
            const [v, lab] = o.split(':');
            return `<option value="${v}"${f.sort === v ? ' selected' : ''}>${lab}</option>`;
          }).join('')}
      </select>
      <span class="count-note">${rows.length} of ${S.projects.length}</span>
    </div>`;

  html += rows.length
    ? '<div class="cards">' + rows.map(projectCard).join('') + '</div>'
    : '<div class="empty"><p>No projects match those filters.</p></div>';

  setView(html);
  bindFilters();
}

function projectCard(p, i) {
  const r = p._roll || {};
  const pct = Math.round((Number(p.progress_pct) || 0) * 100);
  const stale = r.daysSinceTest !== '' && r.daysSinceTest > 60;
  const issue = r.openIssues
    ? (r.criticalIssues ? `${r.openIssues} · ${r.criticalIssues} crit` : String(r.openIssues))
    : '';

  return `<div class="card${String(p.is_archived) === 'Yes' ? ' archived' : ''}"
       style="animation-delay:${i * 18}ms" data-act="open" data-id="${esc(p.project_id)}">
    <div class="card-top">
      <div>
        <div class="card-id">${esc(p.project_id)} · ${esc(p.category)}</div>
        <h3 class="card-name">${esc(p.project_name)}</h3>
      </div>
      <div style="text-align:right">${pill(p.status)}</div>
    </div>

    <p class="card-desc">${esc(p.description || 'No description.')}</p>

    <div class="card-chips">${pill(p.health)}${pill(p.priority)}
      <span class="pill no-dot mono">${esc(p.current_version || 'no version')}</span></div>

    <div class="card-progress">
      <div class="progress"><span style="width:${pct}%"></span></div>
      <div class="card-meta">
        <span><b>${pct}%</b> done</span>
        <span><b>${r.openTasks || 0}</b> tasks</span>
        ${issue ? `<span><b>${issue}</b> issues</span>` : ''}
        ${r.overdueTasks ? `<span style="color:var(--red)"><b>${r.overdueTasks}</b> overdue</span>` : ''}
      </div>
    </div>

    <div class="card-foot">${avatarStack(r.team)}
      <span class="mono faint">${r.lastTested ? 'tested ' + fmtDate(r.lastTested) : 'never tested'}${stale
        ? ' · stale' : ''}</span>
    </div>
  </div>`;
}

function bindFilters() {
  const q = $('#fq');
  let timer;
  if (q) {
    q.addEventListener('input', () => {
      S.filters.q = q.value;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const pos = q.selectionStart;
        renderProjects();
        const nq = $('#fq');
        nq.focus();
        nq.setSelectionRange(pos, pos);
      }, 180);
    });
  }
  [['#fstatus', 'status'], ['#fcat', 'category'], ['#fhealth', 'health'],
   ['#farch', 'archived'], ['#fsort', 'sort']].forEach(([sel, key]) => {
    const el = $(sel);
    if (el) el.addEventListener('change', () => { S.filters[key] = el.value; renderProjects(); });
  });
}

/* =========================================================================
 * PROJECT DETAIL
 * ========================================================================= */
async function viewProject(id) {
  loading();
  try {
    S.detail = await Api.project(id);
    const tabs = [...S.boot.childTables, 'Activity_Log'];
    if (!tabs.includes(S.activeTab)) S.activeTab = 'Tasks';
    renderProject();
  } catch (err) {
    setView(`<div class="empty"><p>${esc(errText(err))}</p></div>`);
  }
}
function renderProject() {
  const d = S.detail;
  const p = d.project;
  const r = p._roll || {};
  const pct = Math.round((Number(p.progress_pct) || 0) * 100);
  const owner = S.people[p.owner_id];

  let html = '<a href="#/projects" class="mono faint" style="font-size:11px">&larr; all projects</a>';

  html += `<div class="detail-head" style="margin-top:12px">
    <div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">
      <div style="flex:1;min-width:260px">
        <div class="card-id">${esc(p.project_id)} · ${esc(p.category)}${p.platform ? ' · ' + esc(p.platform) : ''}</div>
        <h1 class="detail-title">${esc(p.project_name)}</h1>
        <div class="detail-chips">${pill(p.status)}${pill(p.health)}${pill(p.priority)}
          <span class="pill no-dot mono">${esc(p.current_version || '—')}</span>${pill(p.test_status)}
          ${String(p.is_archived) === 'Yes' ? '<span class="pill p-grey">Archived</span>' : ''}</div>
        <p class="dim" style="max-width:70ch;margin:0">${esc(p.description)}</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${canEdit() ? `<button class="btn btn-ghost" data-act="edit-project" data-id="${esc(p.project_id)}">Edit project</button>` : ''}
        ${canDeleteProject() ? `<button class="btn btn-ghost" data-act="delete-project" data-id="${esc(p.project_id)}">Delete</button>` : ''}
      </div>
    </div>

    <div style="margin-top:16px">
      <div class="progress"><span style="width:${pct}%"></span></div>
      <div class="mono faint" style="font-size:10.5px;margin-top:6px">${pct}% complete</div>
    </div>

    <div class="detail-grid">
      ${dl('Owner', owner ? esc(owner.full_name) : esc(p.owner_id))}
      ${dl('Client', esc(p.client))}
      ${dl('Environment', esc(p.environment))}
      ${dl('Hosting', esc(p.hosting))}
      ${dl('Database', esc(p.database))}
      ${dl('Tech stack', esc(p.tech_stack))}
      ${dl('Local folder', esc(p.local_path), true)}
      ${dl('Backup path', esc(p.backup_path), true)}
      ${dl('Repository', link(p.repo_url))}
      ${dl('Live URL', link(p.live_url))}
      ${dl('Docs', link(p.docs_url))}
      ${dl('Credentials', esc(p.credentials_ref))}
      ${dl('Started', fmtDate(p.start_date), true)}
      ${dl('Last deployed', fmtDate(p.last_deployed), true)}
      ${dl('Next review', fmtDate(p.next_review_date), true)}
      ${dl('Tags', esc(p.tags))}
      ${p.notes ? dl('Notes', esc(p.notes)) : ''}
    </div>
  </div>`;

  const stats = [
    ['Open tasks', r.openTasks || 0], ['Overdue', r.overdueTasks || 0],
    ['Done', r.doneTasks || 0], ['Hours', r.hoursLogged || 0],
    ['Open issues', r.openIssues || 0], ['Critical', r.criticalIssues || 0],
    ['Versions', r.versions || 0],
    ['Last release', r.lastRelease ? fmtDate(r.lastRelease) : '—'],
    ['Tests', r.tests || 0], ['Days since test', fmtNum(r.daysSinceTest)],
    ['Team', r.teamSize || 0]
  ];
  const STAT_COLOR = {
    'Open tasks':'stat-accent','Overdue':'stat-red','Done':'stat-green',
    'Hours':'stat-teal','Open issues':'stat-accent2','Critical':'stat-red',
    'Versions':'stat-violet','Last release':'stat-accent','Tests':'stat-green',
    'Days since test':'stat-yellow','Team':'stat-teal'
  };
  html += '<div class="stat-strip">' + stats.map(([lab, val]) => `
    <div class="stat ${STAT_COLOR[lab]||''}"><div class="stat-val">${esc(val)}</div><div class="stat-lab">${esc(lab)}</div></div>`
  ).join('') + '</div>';

  const tabs = [...S.boot.childTables, 'Activity_Log'];
  html += '<div class="tabs">' + tabs.map((t) => `
    <button class="tab${S.activeTab === t ? ' active' : ''}" data-act="tab" data-tab="${esc(t)}">
      ${esc(TABLE_LABEL[t] || t)}<span class="badge">${(d[t] || []).length}</span>
    </button>`).join('') + '</div>';

  html += `<div id="tabBody">${renderTab(S.activeTab)}</div>`;
  setView(html);
}

function renderTab(table) {
  const d = S.detail;
  const rows = d[table] || [];
  const pid = d.project.project_id;

  if (table === 'Activity_Log') {
    if (!rows.length) return '<div class="empty"><p>No activity recorded for this project.</p></div>';
    return `<div class="table-wrap"><table>
      <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Entity</th><th>Field</th><th>From</th><th>To</th></tr></thead>
      <tbody>` + rows.map((a) => `
        <tr><td class="mono">${fmtWhen(a.timestamp)}</td>
          <td>${esc(personName(a.user_id))}</td>
          <td>${pill(a.action, true)}</td>
          <td class="mono">${esc(a.entity_type)} ${esc(a.entity_id)}</td>
          <td class="mono faint">${esc(a.field_changed || '—')}</td>
          <td class="faint">${esc(a.old_value || '—')}</td>
          <td>${esc(a.new_value || '—')}</td></tr>`).join('') + '</tbody></table></div>';
  }

  const cols = TABLE_COLS[table] || [];
  const head = `<div class="tab-head">
      <p class="eyebrow" style="margin:0">${esc(TABLE_LABEL[table])} — ${rows.length} record${rows.length === 1 ? '' : 's'}</p>
      <div class="spacer"></div>
      ${canEdit() ? `<button class="btn btn-primary btn-sm" data-act="new-child" data-table="${esc(table)}" data-id="${esc(pid)}">+ Add</button>` : ''}
    </div>`;

  if (!rows.length) {
    return head + `<div class="empty"><p>Nothing here yet.</p>
      ${canEdit() ? `<button class="btn btn-ghost btn-sm" data-act="new-child" data-table="${esc(table)}" data-id="${esc(pid)}">Add the first one</button>` : ''}
    </div>`;
  }

  const idField = ID_FIELD[table];
  const tableHtml = `<div class="table-wrap"><table class="stackable">
    <thead><tr><th>ID</th>${cols.map((c) => `<th>${esc(humanize(c))}</th>`).join('')}${canEdit() ? '<th></th>' : ''}</tr></thead>
    <tbody>` + rows.map((row) => `
      <tr data-id="${esc(row[idField])}">
        <td class="id" data-label="ID">${esc(row[idField])}</td>
        ${cols.map((c) => `<td data-label="${esc(humanize(c))}">${renderCell(table, c, row)}</td>`).join('')}
        ${canEdit() ? `<td class="actions" data-label="">
          <button class="btn btn-ghost btn-sm" data-act="edit-child" data-table="${esc(table)}" data-id="${esc(row[idField])}">Edit</button>
          <button class="btn btn-ghost btn-sm" data-act="delete-child" data-table="${esc(table)}" data-id="${esc(row[idField])}">Del</button>
        </td>` : ''}
      </tr>`).join('') + '</tbody></table></div>';

  return head + tableHtml + childCardGrid(table, rows);
}

/* Build proper card cards for the mobile detail view (each record = one card). */
function childCardGrid(table, rows) {
  const cols = TABLE_COLS[table] || [];
  const idField = ID_FIELD[table];

  const cards = rows.map((row) => {
    const id = esc(row[idField]);
    const head = cols.find((c) => ['title', 'label', 'summary', 'version'].includes(c))
      || cols[0];
    const headVal = head ? row[head] : '';
    const pillCols = ['status', 'priority', 'severity', 'result', 'change_type', 'test_status'];
    const pillField = pillCols.find((c) => cols.includes(c));
    const pillVal = pillField ? row[pillField] : '';

    const bodyCols = cols.filter((c) =>
      c !== head && c !== pillField &&
      !['url'].includes(c) &&
      row[c] !== '' && row[c] !== null && row[c] !== undefined);

    const rowsHtml = bodyCols.map((c) => `
      <div class="cc-row"><span class="cc-k">${esc(humanize(c))}</span>
        <span class="cc-v">${renderCell(table, c, row)}</span></div>`).join('');

    const custom = [];
    if (cols.includes('url') && row.url) custom.push(link(row.url));
    if (cols.includes('due_date') && row.due_date) {
      const overdue = row.due_date < S.boot.today && row.status !== 'Done' && row.status !== 'Cancelled';
      custom.push(`<span class="mono"${overdue ? ' style="color:var(--red)"' : ''}>due ${fmtDate(row.due_date)}</span>`);
    }
    const meta = custom.join('');

    return `<div class="cc">
      <div class="cc-top">
        <div>
          <div class="cc-id">${id}</div>
          ${head && headVal ? `<div class="cc-name">${esc(headVal)}</div>` : ''}
        </div>
        ${pillVal ? pill(pillVal) : '<span></span>'}
      </div>
      ${rowsHtml ? `<div class="cc-body">${rowsHtml}</div>` : ''}
      ${meta ? `<div class="cc-meta">${meta}</div>` : ''}
      ${canEdit() ? `<div class="cc-actions">
        <button class="btn btn-ghost btn-sm" data-act="edit-child" data-table="${esc(table)}" data-id="${id}">Edit</button>
        <button class="btn btn-ghost btn-sm" data-act="delete-child" data-table="${esc(table)}" data-id="${id}">Delete</button>
      </div>` : ''}
    </div>`;
  });

  return `<div class="child-cards">${cards.join('')}</div>`;
}

function renderCell(table, field, row) {
  const v = row[field];

  if (field === 'url') return link(v);
  if (/_id$/.test(field) && S.people[v]) return personCell(v);

  if (['status', 'priority', 'severity', 'health', 'result', 'is_primary',
       'is_active', 'change_type', 'access_level', 'test_status'].includes(field)) {
    return pill(v);
  }
  if (/date|due|added_on/.test(field)) {
    const overdue = field === 'due_date' && v && v < S.boot.today &&
                    row.status !== 'Done' && row.status !== 'Cancelled';
    return `<span class="mono"${overdue ? ' style="color:var(--red)"' : ''}>${fmtDate(v)}</span>`;
  }
  if (['est_hours', 'actual_hours', 'issues_found'].includes(field)) {
    return `<span class="mono">${fmtNum(v)}</span>`;
  }
  if (['version', 'version_tested', 'fixed_in_version', 'commit_ref'].includes(field)) {
    return `<span class="mono">${esc(v || '—')}</span>`;
  }
  if (['title', 'label', 'summary'].includes(field)) {
    const sub = row.description || row.notes;
    return `<span class="cell-strong">${esc(v)}</span>` +
      (sub ? `<div class="cell-sub">${esc(String(sub).slice(0, 90))}</div>` : '');
  }
  return esc(v === '' ? '—' : v);
}

/* =========================================================================
 * FORM BUILDER
 * The schema comes from the server, which read it off the live header row.
 * Add a column to the sheet and it shows up here on the next login.
 * ========================================================================= */
function buildFormHtml(table, record) {
  const fields = S.boot.schema[table] || [];
  const byName = Object.fromEntries(fields.map((f) => [f.field, f]));

  let html = '<div class="form-grid">';
  if (table === 'Projects') {
    const placed = new Set();
    PROJECT_SECTIONS.forEach(([title, names]) => {
      html += `<div class="form-section">${esc(title)}</div>`;
      names.forEach((n) => {
        if (byName[n]) { html += fieldHtml(byName[n], record); placed.add(n); }
      });
    });
    const rest = fields.filter((f) => !placed.has(f.field));
    if (rest.length) {
      html += '<div class="form-section">Other</div>';
      rest.forEach((f) => { html += fieldHtml(f, record); });
    }
  } else {
    fields.forEach((f) => { html += fieldHtml(f, record); });
  }
  return html + '</div>';
}

function fieldHtml(f, record) {
  if (f.hidden) return '';
  if (f.readonly && !record[f.field]) return '';   // hide empty ids/stamps on create

  const v = record[f.field] ?? '';
  const cls = 'field ' + (f.width === 'full' ? 'full' : '');
  const label = `<span class="field-label">${esc(f.label)}${f.required ? ' <span class="req">*</span>' : ''}</span>`;
  const attrs = `data-field="${esc(f.field)}"${f.readonly ? ' readonly' : ''}${f.mono ? ' class="mono"' : ''}`;
  let body;

  if (f.type === 'select') {
    let options = '<option value=""></option>';
    if (f.ref === 'Collaborators') {
      options += S.boot.collaborators.map((c) =>
        `<option value="${esc(c.collaborator_id)}"${c.collaborator_id === v ? ' selected' : ''}>
          ${esc(c.full_name)} (${esc(c.collaborator_id)})</option>`).join('');
    } else {
      const values = f.options || (f.list ? (S.boot.lists[f.list] || []) : []);
      options += values.map((o) =>
        `<option value="${esc(o)}"${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('');
      if (v && !values.includes(v)) {
        options += `<option value="${esc(v)}" selected>${esc(v)} (not in list)</option>`;
      }
    }
    body = `<select ${attrs}>${options}</select>`;
  } else if (f.type === 'textarea') {
    body = `<textarea ${attrs} rows="3">${esc(v)}</textarea>`;
  } else if (f.type === 'percent') {
    const pctVal = v === '' ? '' : Math.round(Number(v) * 100);
    body = `<input type="number" min="0" max="100" step="1" data-percent="1" ${attrs} value="${esc(pctVal)}">`;
  } else if (f.type === 'number') {
    body = `<input type="number" step="0.5" ${attrs} value="${esc(v)}">`;
  } else if (f.type === 'date') {
    body = `<input type="date" ${attrs} value="${esc(String(v).slice(0, 10))}">`;
  } else {
    const t = f.type === 'url' ? 'url' : (f.type === 'email' ? 'email' : 'text');
    body = `<input type="${t}" ${attrs} value="${esc(v)}">`;
  }

  return `<label class="${cls}">${label}${body}
    ${f.hint ? `<span class="field-hint">${esc(f.hint)}</span>` : ''}</label>`;
}

/** Read the modal form back into a plain object. */
function collectForm() {
  const out = {};
  $$('#modalBody [data-field]').forEach((el) => {
    const name = el.getAttribute('data-field');
    out[name] = el.hasAttribute('data-percent')
      ? (el.value === '' ? '' : Number(el.value) / 100)
      : el.value;
  });
  return out;
}

/** Names of required fields left blank. */
function missingRequired(table) {
  return (S.boot.schema[table] || [])
    .filter((f) => f.required)
    .filter((f) => {
      const el = $(`#modalBody [data-field="${f.field}"]`);
      return el && !String(el.value).trim();
    })
    .map((f) => f.label);
}


/* =========================================================================
 * APP  - boot, auth, router, write actions
 * ========================================================================= */
/**
 * app.js — boot sequence, auth screen, hash router, and every write action.
 *
 * Inline onclick handlers in views.js call through window.PDT, which is
 * defined at the bottom of this file.
 */


/* =========================================================================
 * BOOT
 * ========================================================================= */

async function start() {
  initTheme();
  wireConfirm();
  wireChrome();

  document.title = CONFIG.APP_NAME;
  $('#footBuild').textContent = CONFIG.BUILD;

  const token = loadToken();
  if (!token) return showLogin();

  try {
    const boot = await Api.bootstrap();
    onBooted(boot);
  } catch (err) {
    // expired or revoked token, or the API is unreachable
    showLogin(err.code === 'AUTH_REQUIRED' ? '' : errText(err));
  }
}

function onBooted(boot) {
  setBoot(boot);

  $('#boot').classList.add('hidden');
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');

  const s = boot.session;
  $('#whoami').innerHTML =
    avatar({ full_name: s.name, initials: s.initials, avatar_url: s.avatarUrl }) +
    `<span class="meta"><span class="name">${esc(s.name)}</span><br>
     <span class="role">${esc(s.role)}</span></span>`;
  $('#footInfo').textContent =
    `${boot.app.name} v${boot.app.version} · ${s.username} · ${boot.today}`;

  if (!location.hash) location.hash = '#/dashboard';
  route();
}

function showLogin(message) {
  $('#boot').classList.add('hidden');
  $('#app').classList.add('hidden');
  $('#login').classList.remove('hidden');
  if (message) {
    const e = $('#loginError');
    e.textContent = message;
    e.classList.remove('hidden');
  }
  setTimeout(() => $('#loginUser').focus(), 60);
}

function signOutLocal(message) {
  setToken(null);
  resetAll();
  showLogin(message);
}

/* the API layer fires this when the server rejects a token mid-session */
window.addEventListener('pdt:auth-required', () => {
  signOutLocal('Your session expired. Sign in again.');
});

/* =========================================================================
 * AUTH SCREEN
 * ========================================================================= */

$('#loginForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const btn = $('#loginBtn');
  const err = $('#loginError');
  err.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = 'Checking…';

  try {
    const session = await Api.login($('#loginUser').value, $('#loginPass').value);
    setToken(session.token);
    $('#loginPass').value = '';
    onBooted(await Api.bootstrap());
  } catch (e) {
    err.textContent = errText(e);
    err.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign in';
  }
});

function wireChrome() {
  $('#logoutBtn').addEventListener('click', () => {
    Api.logout().catch(() => {});
    signOutLocal();
  });

  $('#refreshBtn').addEventListener('click', () => {
    clearCaches();
    route();
    toast('Reloaded from the sheet', 'ok');
  });

  $('#themeBtn').addEventListener('click', () => {
    toggleTheme();
    toast('Theme: ' + currentTheme(), 'ok');
  });

  $('#passwordBtn').addEventListener('click', openPasswordForm);

  $('#modalSave').addEventListener('click', onModalSave);

  document.addEventListener('click', (ev) => {
    if (ev.target.dataset && ev.target.dataset.close) {
      ev.target.closest('.modal').classList.add('hidden');
    }
    const anchor = ev.target.closest('a[href]');
    if (anchor) {
      const url = anchor.href;
      const isExternal = /^https?:\/\//.test(url) || /^www\./.test(url);
      if (isExternal) {
        ev.preventDefault();
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    }
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      $('#modal').classList.add('hidden');
      $('#confirm').classList.add('hidden');
    }
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter' &&
        !$('#modal').classList.contains('hidden')) {
      $('#modalSave').click();
    }
  });

  // Mobile sidebar
  const hamburgerBtn = $('#hamburgerBtn');
  const sidebarOverlay = $('#sidebarOverlay');
  const sidebar = $('#sidebar');

  function openSidebar() {
    document.body.style.overflow = 'hidden';
    sidebarOverlay.classList.remove('hidden');
    sidebar.classList.remove('hidden');
    requestAnimationFrame(() => {
      sidebarOverlay.classList.add('show');
      sidebar.classList.add('show');
    });
  }

  function closeSidebar() {
    closeSidebarRaw();
  }

  window.closeSidebarRaw = function closeSidebarRaw() {
    document.body.style.overflow = '';
    const ov = $('#sidebarOverlay');
    const sb = $('#sidebar');
    if (!sb) return;
    ov.classList.remove('show');
    sb.classList.remove('show');
    setTimeout(() => {
      ov.classList.add('hidden');
      sb.classList.add('hidden');
    }, 300);
  };

  hamburgerBtn.addEventListener('click', openSidebar);
  sidebarOverlay.addEventListener('click', closeSidebar);

  $('#themeBtnMobile').addEventListener('click', () => {
    toggleTheme();
    toast('Theme: ' + currentTheme(), 'ok');
  });

  $('#passwordBtnMobile').addEventListener('click', openPasswordForm);

  $('#logoutBtnMobile').addEventListener('click', () => {
    Api.logout().catch(() => {});
    signOutLocal();
  });
}

/* =========================================================================
 * ROUTER
 * ========================================================================= */

window.addEventListener('hashchange', route);

function route() {
  if (!S.boot) return;
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  const page = parts[0] || 'dashboard';

  document.querySelectorAll('#nav a').forEach((a) => {
    a.classList.toggle('active', a.dataset.route === page);
  });

  closeSidebarRaw();

  if (page === 'project' && parts[1]) return viewProject(parts[1]);
  if (page === 'projects') return viewProjects();
  return viewDashboard();
}

/* =========================================================================
 * WRITE ACTIONS
 * ========================================================================= */

/** What the open modal is editing. */
let modalCtx = { table: null, id: null, parentId: null, mode: 'record' };

function newProject() {
  modalCtx = { table: 'Projects', id: null, parentId: null, mode: 'record' };
  openModal({ title: 'New project', body: buildFormHtml('Projects', {}) });
}

function editProject(id) {
  const rec = [...S.projects, ...(S.detail ? [S.detail.project] : [])]
    .find((p) => p.project_id === id);
  if (!rec) return toast('Reload and try again', 'err');
  modalCtx = { table: 'Projects', id, parentId: null, mode: 'record' };
  openModal({ title: 'Edit project', body: buildFormHtml('Projects', rec) });
}

function newChild(table, parentId) {
  modalCtx = { table, id: null, parentId, mode: 'record' };
  openModal({
    title: 'New ' + (TABLE_LABEL[table] || table).replace(/s$/, '').toLowerCase(),
    body: buildFormHtml(table, { project_id: parentId })
  });
}

function editChild(table, id) {
  const rec = (S.detail?.[table] || []).find((r) => r[ID_FIELD[table]] === id);
  if (!rec) return toast('Reload and try again', 'err');
  modalCtx = { table, id, parentId: rec.project_id, mode: 'record' };
  openModal({
    title: 'Edit ' + (TABLE_LABEL[table] || table).replace(/s$/, '').toLowerCase(),
    body: buildFormHtml(table, rec)
  });
}

function openPasswordForm() {
  modalCtx = { table: null, id: null, parentId: null, mode: 'password' };
  openModal({
    title: 'Change password',
    saveLabel: 'Update password',
    body: `<div class="form-grid">
      <label class="field full"><span class="field-label">Current password</span>
        <input type="password" data-field="current" autocomplete="current-password"></label>
      <label class="field full"><span class="field-label">New password</span>
        <input type="password" data-field="next" autocomplete="new-password">
        <span class="field-hint">At least 10 characters. Your other sessions will be signed out.</span></label>
      <label class="field full"><span class="field-label">Confirm new password</span>
        <input type="password" data-field="confirm" autocomplete="new-password"></label>
    </div>`
  });
}

async function onModalSave() {
  const btn = $('#modalSave');
  const original = btn.textContent;
  modalMessage('');

  if (modalCtx.mode === 'password') {
    const f = collectForm();
    if (!f.current || !f.next) return modalMessage('Fill in both password fields.');
    if (f.next !== f.confirm) return modalMessage('The new passwords do not match.');
    if (f.next.length < 10) return modalMessage('Use at least 10 characters.');

    btn.disabled = true;
    btn.textContent = 'Updating…';
    try {
      await Api.changePassword(f.current, f.next);
      closeModal();
      toast('Password updated', 'ok');
    } catch (e) {
      modalMessage(errText(e));
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
    return;
  }

  const missing = missingRequired(modalCtx.table);
  if (missing.length) return modalMessage('Required: ' + missing.join(', '));

  const payload = collectForm();
  if (modalCtx.parentId) payload.project_id = modalCtx.parentId;
  if (modalCtx.id) payload[ID_FIELD[modalCtx.table]] = modalCtx.id;

  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    await Api.save(modalCtx.table, payload);
    const wasEdit = !!modalCtx.id;
    closeModal();
    toast(wasEdit ? 'Saved' : 'Created', 'ok');
    await afterWrite();
  } catch (e) {
    modalMessage(errText(e));
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

function deleteProject(id) {
  const p = S.detail?.project || S.projects.find((x) => x.project_id === id) || {};
  askConfirm(
    'Delete project',
    `This removes <b>${esc(p.project_name || id)}</b> and <b>every</b> linked record —
     links, versions, tasks, issues, test runs, team assignments and its activity
     history. This cannot be undone.`,
    async () => {
      try {
        await Api.remove('Projects', id);
        toast('Project deleted', 'ok');
        clearCaches();
        location.hash = '#/projects';
        route();
      } catch (e) {
        toast(errText(e), 'err');
      }
    }
  );
}

function deleteChild(table, id) {
  askConfirm(
    'Delete record',
    `Delete <b>${esc(id)}</b> from ${esc(TABLE_LABEL[table] || table)}?`,
    async () => {
      try {
        await Api.remove(table, id);
        toast('Deleted', 'ok');
        await afterWrite();
      } catch (e) {
        toast(errText(e), 'err');
      }
    }
  );
}

/** Refresh whatever is on screen after a successful write. */
async function afterWrite() {
  const pid = S.detail?.project?.project_id;
  clearCaches();
  if (location.hash.startsWith('#/project/') && pid) await viewProject(pid);
  else route();
}

/* =========================================================================
 * Delegated click handling
 *
 * Views emit data-act attributes rather than inline onclick handlers, so the
 * Content-Security-Policy in functions-optional/_headers can keep script-src
 * as 'self' with no 'unsafe-inline'. One listener covers every screen.
 * ========================================================================= */

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el || !$('#app').contains(el)) return;

  const { act, id, table, tab } = el.dataset;

  // a button inside a clickable card must not also open the card
  if (act !== 'open') ev.stopPropagation();

  switch (act) {
    case 'open':          location.hash = '#/project/' + id; break;
    case 'tab':           S.activeTab = tab; renderProject(); break;
    case 'new-project':   newProject(); break;
    case 'edit-project':  editProject(id); break;
    case 'delete-project': deleteProject(id); break;
    case 'new-child':     newChild(table, id); break;
    case 'edit-child':    editChild(table, id); break;
    case 'delete-child':  deleteChild(table, id); break;
  }
});

start();


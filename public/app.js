/* QA Copilot frontend. Vanilla JS, no build step, no framework. */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const state = {
  projects: [],
  project: null,
  cases: [],
  models: {},
  families: [],
  selected: new Set(),
  expanded: null,
  playwright: false,
};

/* ------------------------------------------------------------- plumbing */

async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const json = await res.json().catch(() => ({ ok: false, error: 'Bad response from server' }));
  if (!json.ok) throw new Error(json.error || 'Request failed');
  return json;
}

let toastTimer;
function toast(msg, isError = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `toast${isError ? ' error' : ''}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, isError ? 6000 : 3000);
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function modal(html) {
  const m = $('#modal');
  m.innerHTML = `<div class="modal-box">${html}</div>`;
  m.hidden = false;
  m.onclick = (e) => { if (e.target === m) closeModal(); };
  const first = m.querySelector('input,textarea,select');
  if (first) first.focus();
}
const closeModal = () => { $('#modal').hidden = true; $('#modal').innerHTML = ''; };

/* ---------------------------------------------------------------- boot */

async function boot() {
  const saved = localStorage.getItem('qa-theme');
  if (saved) document.documentElement.dataset.theme = saved;

  try {
    const health = await api('/health');
    state.playwright = health.playwright;
    state.families = health.families;
    $('#scanner-mode').textContent = health.playwright
      ? 'full browser scanner' : 'static scanner';
    $('#scanner-mode').title = health.playwright
      ? 'Playwright is installed — JS-rendered and logged-in pages scan correctly.'
      : 'Run "npm run browsers" to scan JavaScript-rendered pages.';
  } catch {
    toast('Cannot reach the server.', true);
  }

  await loadProjects();
  wireGlobal();
}

async function loadProjects() {
  const { projects } = await api('/projects');
  state.projects = projects;
  renderProjectList();
  if (projects.length && !state.project) await openProject(projects[0].id);
  if (!projects.length) {
    $('#empty-state').hidden = false;
    $('#workspace').hidden = true;
  }
}

function renderProjectList() {
  $('#project-list').innerHTML = state.projects.map((p) => `
    <li data-id="${p.id}" class="${state.project?.id === p.id ? 'active' : ''}">
      ${esc(p.name)}
      <small>${p.pages.length} page${p.pages.length === 1 ? '' : 's'}${
        state.project?.id === p.id ? ` · ${state.cases.length} case${state.cases.length === 1 ? '' : 's'}` : ''}</small>
    </li>`).join('');
  $$('#project-list li').forEach((li) => {
    li.onclick = () => openProject(li.dataset.id);
  });
}

async function openProject(id) {
  const { project, cases, models } = await api(`/projects/${id}`);
  state.project = project;
  state.cases = cases;
  state.models = models;
  state.selected.clear();
  state.expanded = null;

  $('#empty-state').hidden = true;
  $('#workspace').hidden = false;
  $('#project-name').textContent = project.name;
  $('#project-meta').textContent = [
    project.product,
    `${project.pages.length} page(s)`,
    `${cases.length} case(s)`,
    Object.entries(project.environments).filter(([, v]) => v).map(([k]) => k.toUpperCase()).join('/') || 'no environments set',
  ].filter(Boolean).join(' · ');

  // keep the sidebar list in step with the freshly loaded project, otherwise
  // its page/case counts stay stale until a full reload
  const i = state.projects.findIndex((x) => x.id === project.id);
  if (i !== -1) state.projects[i] = project;

  renderProjectList();
  renderPages();
  renderCases();
  loadPlan();
  wireExportLinks();
}

/* --------------------------------------------------------------- pages */

function renderPages() {
  const wrap = $('#page-list');
  if (!state.project.pages.length) {
    wrap.innerHTML = '<p class="muted center">No pages yet. Paste a URL above to begin.</p>';
    return;
  }

  wrap.innerHTML = state.project.pages.map((p) => {
    const m = state.models[p.id];
    const n = state.cases.filter((c) => c.pageId === p.id).length;
    return `
    <div class="page-card" data-page="${p.id}">
      <div class="page-head">
        <div>
          <strong>${esc(p.name)}</strong>
          <span class="badge b-P3">${esc(p.module)}</span>
          <div class="url">${esc(p.url)}</div>
        </div>
        <div class="row" style="margin:0">
          <span class="muted">${n} case${n === 1 ? '' : 's'}</span>
          <button class="ghost" data-act="paste">Paste HTML</button>
          <button class="primary" data-act="scan">${m ? 'Re-scan' : 'Scan'}</button>
          <button class="ghost danger" data-act="del">✕</button>
        </div>
      </div>
      <div class="page-body">
        ${m ? modelSummary(p, m) : '<p class="muted">Not scanned yet. Scanning reads the live DOM — every case below is derived from what it finds, so nothing is invented.</p>'}
      </div>
    </div>`;
  }).join('');

  $$('.page-card').forEach((card) => {
    const id = card.dataset.page;
    card.querySelector('[data-act=scan]').onclick = () => scanPage(id);
    card.querySelector('[data-act=del]').onclick = () => deletePage(id);
    card.querySelector('[data-act=paste]').onclick = () => pasteHtml(id);
    const gen = card.querySelector('[data-act=generate]');
    if (gen) gen.onclick = () => generateCases(id, card);
    const prompt = card.querySelector('[data-act=prompt]');
    if (prompt) prompt.onclick = () => codexPrompt(id);
    const imp = card.querySelector('[data-act=import]');
    if (imp) imp.onclick = () => codexImport(id);
    const req = card.querySelector('[data-act=req]');
    if (req) req.onclick = () => editRequirements(id);
  });
}

function modelSummary(page, m) {
  const fields = m.fields || [];
  const detected = fields.filter((f) => f.required).length;
  const apis = (m.network || []).length;

  return `
  <div class="stat-row">
    <div class="stat"><b>${fields.length}</b>fields</div>
    <div class="stat"><b>${detected}</b>required</div>
    <div class="stat"><b>${(m.buttons || []).length}</b>buttons</div>
    <div class="stat"><b>${(m.links || []).length}</b>links</div>
    <div class="stat"><b>${apis}</b>API calls</div>
    <div class="stat"><b>${(m.tables || []).length}</b>tables</div>
    <div class="stat"><b>${(m.consoleErrors || []).length}</b>console errors</div>
  </div>
  <p class="muted">Scanned ${new Date(m.scannedAt).toLocaleString()} via <code>${m.engine}</code>${m.httpStatus ? ` · HTTP ${m.httpStatus}` : ''}</p>
  ${m.note ? `<div class="diff">${esc(m.note)}</div>` : ''}
  ${page.requirements ? `<p class="muted">📎 Requirements attached (${page.requirements.length} chars)</p>` : ''}

  <details>
    <summary class="muted" style="cursor:pointer;margin:8px 0">Field detail</summary>
    <div class="table-wrap" style="margin-top:8px">
      <table><thead><tr><th>Field</th><th>Type</th><th>Label</th><th>Constraints</th></tr></thead>
      <tbody>${fields.map((f) => `<tr>
        <td class="id">${esc(f.key)}</td>
        <td>${esc(f.type)}${f.required ? ' <span class="badge b-P1">req</span>' : ''}</td>
        <td>${esc(f.label || f.placeholder || '—')}</td>
        <td class="kv">${[
    f.maxlength && `max=${f.maxlength}`, f.minlength && `min=${f.minlength}`,
    f.min !== null && `≥${f.min}`, f.max !== null && `≤${f.max}`,
    f.pattern && 'pattern', f.accept && `accept=${f.accept}`,
    f.options && `${f.options.length} options`,
    f.disabled && 'disabled', f.readonly && 'readonly',
  ].filter(Boolean).join(' · ') || '—'}</td></tr>`).join('')}</tbody></table>
    </div>
  </details>

  <h3 style="margin-top:14px">Rule families</h3>
  <div class="family-grid">
    ${state.families.map((f) => `<label><input type="checkbox" class="fam" value="${f.id}" checked> ${esc(f.label)}</label>`).join('')}
  </div>
  <div class="row">
    <select class="aggr">
      <option value="lean">Lean — fewest cases</option>
      <option value="standard" selected>Standard</option>
      <option value="exhaustive">Exhaustive — every variant</option>
    </select>
    <label class="check"><input type="checkbox" class="replace" checked> Replace previous rule cases for this page</label>
    <button class="primary" data-act="generate">Generate test cases</button>
  </div>
  <div class="row">
    <button class="ghost" data-act="req">Attach requirements</button>
    <button class="ghost" data-act="prompt">Build Codex prompt</button>
    <button class="ghost" data-act="import">Import Codex JSON</button>
  </div>`;
}

async function scanPage(pageId) {
  const card = $(`[data-page="${pageId}"]`);
  const btn = card.querySelector('[data-act=scan]');
  const old = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> scanning';
  try {
    const { model, diff } = await api(`/projects/${state.project.id}/pages/${pageId}/scan`, { method: 'POST', body: {} });
    state.models[pageId] = model;
    const p = state.project.pages.find((x) => x.id === pageId);
    p.lastScannedAt = model.scannedAt;
    renderPages();
    if (diff) showDiff(pageId, diff);
    toast(`Scanned: ${model.fields.length} fields, ${(model.network || []).length} API calls`);
  } catch (err) {
    toast(err.message, true);
    btn.disabled = false;
    btn.textContent = old;
  }
}

function showDiff(pageId, diff) {
  const body = $(`[data-page="${pageId}"] .page-body`);
  if (!body) return;
  if (diff.clean) {
    body.insertAdjacentHTML('afterbegin', '<div class="diff clean">No change since the last scan — existing cases still match the page.</div>');
    return;
  }
  const parts = [];
  if (diff.fieldsAdded.length) parts.push(`<b>New fields:</b> ${diff.fieldsAdded.map((f) => `<code>${esc(f)}</code>`).join(' ')} — regenerate to cover them.`);
  if (diff.fieldsRemoved.length) parts.push(`<b>Removed fields:</b> ${diff.fieldsRemoved.map((f) => `<code>${esc(f)}</code>`).join(' ')} — existing cases for these are now stale.`);
  if (diff.fieldsChanged.length) {
    parts.push(`<b>Changed:</b> ${diff.fieldsChanged.map((c) => `<code>${esc(c.key)}</code> (${c.deltas.map((d) => `${d.attr} ${d.from}→${d.to}`).join(', ')})`).join('; ')}`);
  }
  if (diff.buttonsAdded.length) parts.push(`<b>New buttons:</b> ${diff.buttonsAdded.map(esc).join(', ')}`);
  if (diff.buttonsRemoved.length) parts.push(`<b>Removed buttons:</b> ${diff.buttonsRemoved.map(esc).join(', ')}`);
  body.insertAdjacentHTML('afterbegin', `<div class="diff"><strong>Page changed since the last scan</strong><br>${parts.join('<br>')}</div>`);
}

async function generateCases(pageId, card) {
  const families = $$('.fam', card).filter((c) => c.checked).map((c) => c.value);
  if (!families.length) return toast('Pick at least one rule family', true);
  const btn = card.querySelector('[data-act=generate]');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> generating';
  try {
    const r = await api(`/projects/${state.project.id}/pages/${pageId}/generate`, {
      method: 'POST',
      body: {
        families,
        aggressiveness: $('.aggr', card).value,
        replace: $('.replace', card).checked,
      },
    });
    state.cases = r.cases;
    renderPages();
    renderCases();
    renderCoverage(r.coverage);
    switchTab('cases');
    toast(`${r.added} case(s) added${r.skipped ? `, ${r.skipped} already existed` : ''}`);
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Generate test cases';
  }
}

function renderCoverage(cov) {
  if (!cov) return $('#coverage-strip').replaceChildren();
  $('#coverage-strip').innerHTML = `
    <div class="cov"><b>${cov.total}</b>generated</div>
    <div class="cov"><b>${cov.fieldsScanned}</b>fields scanned</div>
    <div class="cov"><b>${cov.automatable}</b>automatable</div>
    <div class="cov"><b>${cov.smoke}</b>smoke</div>
    ${Object.entries(cov.byFamily).map(([k, v]) => `<div class="cov"><b>${v}</b>${esc(k)}</div>`).join('')}
    ${cov.fieldsWithNoCases.length ? `<div class="cov" style="border-color:var(--warn)"><b>${cov.fieldsWithNoCases.length}</b>fields with no cases</div>` : ''}`;
}

async function deletePage(pageId) {
  if (!confirm('Delete this page and all its test cases?')) return;
  await api(`/projects/${state.project.id}/pages/${pageId}`, { method: 'DELETE' });
  await openProject(state.project.id);
  toast('Page deleted');
}

function pasteHtml(pageId) {
  modal(`<h2>Paste page HTML</h2>
    <p class="muted">For pages the scanner cannot reach — behind SSO, or only
    reachable from your machine. Open the page, view source or copy the DOM from
    devtools, and paste it here.</p>
    <textarea id="html-in" rows="12" placeholder="<html>…"></textarea>
    <div class="row"><button class="primary" id="html-go">Build page model</button>
    <button class="ghost" onclick="closeModal()">Cancel</button></div>`);
  $('#html-go').onclick = async () => {
    try {
      const { model, diff } = await api(`/projects/${state.project.id}/pages/${pageId}/scan`, {
        method: 'POST', body: { html: $('#html-in').value },
      });
      state.models[pageId] = model;
      closeModal();
      renderPages();
      if (diff) showDiff(pageId, diff);
      toast(`Model built: ${model.fields.length} fields`);
    } catch (err) { toast(err.message, true); }
  };
}

function editRequirements(pageId) {
  const page = state.project.pages.find((p) => p.id === pageId);
  modal(`<h2>Requirements for ${esc(page.name)}</h2>
    <p class="muted">Acceptance criteria, business rules, anything the DOM cannot tell you.
    This is not used by the rules engine — it goes into the Codex prompt, where
    judgement-based cases come from.</p>
    <textarea id="req-in" rows="14">${esc(page.requirements || '')}</textarea>
    <div class="row"><button class="primary" id="req-go">Save</button>
    <button class="ghost" onclick="closeModal()">Cancel</button></div>`);
  $('#req-go').onclick = async () => {
    await api(`/projects/${state.project.id}/pages/${pageId}`, {
      method: 'PATCH', body: { requirements: $('#req-in').value },
    });
    page.requirements = $('#req-in').value;
    closeModal();
    renderPages();
    toast('Requirements saved');
  };
}

/* ---------------------------------------------------------- Codex flow */

async function codexPrompt(pageId) {
  let r;
  try {
    r = await api(`/projects/${state.project.id}/pages/${pageId}/prompt`, { method: 'POST', body: {} });
  } catch (err) { return toast(err.message, true); }

  modal(`<h2>Codex hand-off</h2>
    <p class="muted">The rules engine has already covered everything derivable from the
    DOM. This prompt asks for what it cannot derive: business flows, cross-field
    logic, role differences, error-message quality.</p>
    <ol class="muted" style="padding-left:18px">
      <li>Copy the prompt below (or open the file in Cursor and <code>@</code>-mention it)</li>
      <li>Paste it into the Cursor agent panel / Codex</li>
      <li>Save the JSON it returns, then use <b>Import Codex JSON</b></li>
    </ol>
    <p class="kv"><b>prompt file:</b> ${esc(r.file)}</p>
    <textarea id="prompt-out" rows="14" readonly>${esc(r.prompt)}</textarea>
    <div class="row">
      <button class="primary" id="copy-prompt">Copy to clipboard</button>
      <button class="ghost" onclick="closeModal()">Close</button>
    </div>`);
  $('#copy-prompt').onclick = async () => {
    await navigator.clipboard.writeText(r.prompt);
    toast('Prompt copied — paste it into Cursor');
  };
}

function codexImport(pageId) {
  modal(`<h2>Import Codex JSON</h2>
    <p class="muted">Paste the JSON array Codex returned. Markdown fences are stripped
    automatically. Anything already covered is skipped, so re-importing is safe.</p>
    <textarea id="import-in" rows="14" placeholder="[ { &quot;title&quot;: … } ]"></textarea>
    <div class="row">
      <button class="primary" id="import-go">Validate &amp; import</button>
      <button class="ghost" id="import-file-btn">Read from outbox file instead</button>
      <button class="ghost" onclick="closeModal()">Cancel</button>
    </div>
    <div id="import-result"></div>`);

  const run = async (body) => {
    try {
      const r = await api(`/projects/${state.project.id}/pages/${pageId}/import`, { method: 'POST', body });
      state.cases = r.cases;
      renderCases();
      renderPages();
      const errs = r.errors.length
        ? `<div class="diff"><strong>${r.errors.length} case(s) rejected</strong><br>${r.errors.map((e) => `#${e.index}: ${esc(e.message)}`).join('<br>')}</div>`
        : '';
      $('#import-result').innerHTML = `<div class="diff clean">Imported ${r.added}, skipped ${r.skipped} duplicate(s).</div>${errs}`;
      toast(`Imported ${r.added} case(s)`);
    } catch (err) {
      $('#import-result').innerHTML = `<div class="diff">${esc(err.message)}</div>`;
    }
  };

  $('#import-go').onclick = () => run({ json: $('#import-in').value });
  $('#import-file-btn').onclick = () => run({});
}

/* --------------------------------------------------------------- cases */

function visibleCases() {
  const q = $('#f-search').value.trim().toLowerCase();
  return state.cases.filter((c) => {
    if ($('#f-page').value && c.pageId !== $('#f-page').value) return false;
    if ($('#f-category').value && c.category !== $('#f-category').value) return false;
    if ($('#f-priority').value && c.priority !== $('#f-priority').value) return false;
    if ($('#f-type').value && c.type !== $('#f-type').value) return false;
    if ($('#f-source').value && c.source !== $('#f-source').value) return false;
    if ($('#f-smoke').checked && !c.isSmoke) return false;
    if (q) {
      const hay = [c.id, c.title, c.description, c.expectedResult, c.module, c.subModule,
        ...(c.tags || []), ...c.steps.map((s) => s.action)].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderCases() {
  $('#case-count').textContent = state.cases.length;

  const fill = (sel, values, keep) => {
    const cur = $(sel).value;
    $(sel).innerHTML = `<option value="">${keep}</option>${values.map((v) => `<option value="${esc(v.id ?? v)}"${cur === String(v.id ?? v) ? ' selected' : ''}>${esc(v.label ?? v)}</option>`).join('')}`;
  };
  fill('#f-page', state.project.pages.map((p) => ({ id: p.id, label: p.name })), 'All pages');
  fill('#f-category', [...new Set(state.cases.map((c) => c.category))].sort(), 'All categories');
  fill('#f-priority', ['P1', 'P2', 'P3', 'P4'], 'All priorities');

  const list = visibleCases();
  $('#case-empty').hidden = list.length > 0;

  $('#case-body').innerHTML = list.map((c) => {
    const isOpen = state.expanded === c.id;
    return `
    <tr data-id="${c.id}" class="${isOpen ? 'expanded' : ''}">
      <td><input type="checkbox" class="sel" ${state.selected.has(c.id) ? 'checked' : ''}></td>
      <td><button class="link toggle">${isOpen ? '▾' : '▸'}</button></td>
      <td class="id">${esc(c.id)}</td>
      <td class="title"><strong>${esc(c.title)}</strong>
        ${c.isSmoke ? '<span class="badge b-P1">smoke</span>' : ''}
        ${c.automatable ? '' : '<span class="badge b-P3">manual only</span>'}
        <small>${esc(c.subModule || '')}</small></td>
      <td>${esc(c.module)}</td>
      <td>${esc(c.category)}</td>
      <td>${esc(c.type)}</td>
      <td><span class="badge b-${c.priority}">${c.priority}</span></td>
      <td>${esc(c.severity)}</td>
      <td><span class="badge b-${c.status.replace(' ', '')}">${esc(c.status)}</span></td>
      <td class="muted">${esc(c.source)}</td>
    </tr>
    ${isOpen ? detailRow(c) : ''}`;
  }).join('');

  $$('#case-body tr[data-id]').forEach((tr) => {
    const id = tr.dataset.id;
    tr.querySelector('.toggle').onclick = () => {
      state.expanded = state.expanded === id ? null : id;
      renderCases();
    };
    tr.querySelector('.sel').onchange = (e) => {
      if (e.target.checked) state.selected.add(id); else state.selected.delete(id);
      renderBulk();
    };
  });
  wireDetailActions();
  renderBulk();
}

function detailRow(c) {
  return `<tr class="expand-row"><td colspan="11"><div class="detail-grid">
    <div>
      <h3>Description</h3>
      <p>${esc(c.description) || '<span class="muted">—</span>'}</p>
      <h3>Preconditions</h3>
      <ul>${(c.preconditions || []).map((p) => `<li>${esc(p)}</li>`).join('') || '<li class="muted">—</li>'}</ul>
      <h3>Test data</h3>
      ${Object.keys(c.testData || {}).length
    ? `<div class="kv">${Object.entries(c.testData).map(([k, v]) => `<div><b>${esc(k)}:</b> ${esc(v)}</div>`).join('')}</div>`
    : '<p class="muted">—</p>'}
      ${Object.keys(c.selectors || {}).length
    ? `<h3>Suggested locators</h3><div class="kv">${Object.entries(c.selectors).map(([k, v]) => `<div><b>${esc(k)}:</b> ${esc(v)}</div>`).join('')}</div>` : ''}
    </div>
    <div>
      <h3>Steps</h3>
      <ol>${c.steps.map((s) => `<li>${esc(s.action)}${s.data ? ` <code>${esc(s.data)}</code>` : ''}</li>`).join('')}</ol>
      <h3>Expected result</h3>
      <p>${esc(c.expectedResult)}</p>
      <h3>Actual result</h3>
      <textarea class="actual" rows="2" data-id="${c.id}" placeholder="What actually happened…">${esc(c.actualResult)}</textarea>
      <h3>Meta</h3>
      <div class="kv"><b>rule:</b> ${esc(c.ruleId)} · <b>page:</b> ${esc(c.pageUrl)} · <b>tags:</b> ${esc((c.tags || []).join(', ') || '—')}</div>
    </div>
    <div class="detail-actions">
      <select class="edit" data-field="status" data-id="${c.id}">
        ${['Not Run', 'Pass', 'Fail', 'Blocked', 'Skipped'].map((s) => `<option${c.status === s ? ' selected' : ''}>${s}</option>`).join('')}
      </select>
      <select class="edit" data-field="priority" data-id="${c.id}">
        ${['P1', 'P2', 'P3', 'P4'].map((s) => `<option${c.priority === s ? ' selected' : ''}>${s}</option>`).join('')}
      </select>
      <select class="edit" data-field="severity" data-id="${c.id}">
        ${['Critical', 'High', 'Medium', 'Low'].map((s) => `<option${c.severity === s ? ' selected' : ''}>${s}</option>`).join('')}
      </select>
      <select class="edit" data-field="type" data-id="${c.id}">
        ${['Manual', 'Automation'].map((s) => `<option${c.type === s ? ' selected' : ''}>${s}</option>`).join('')}
      </select>
      <button class="ghost edit-full" data-id="${c.id}">Edit title, steps &amp; expected</button>
      <button class="ghost danger del-case" data-id="${c.id}">Delete</button>
    </div>
  </div></td></tr>`;
}

function wireDetailActions() {
  $$('.edit').forEach((el) => {
    el.onchange = async () => {
      await api(`/projects/${state.project.id}/cases/${el.dataset.id}`, {
        method: 'PATCH', body: { [el.dataset.field]: el.value },
      });
      const c = state.cases.find((x) => x.id === el.dataset.id);
      c[el.dataset.field] = el.value;
      renderCases();
      toast('Saved');
    };
  });
  $$('.actual').forEach((el) => {
    el.onblur = async () => {
      const c = state.cases.find((x) => x.id === el.dataset.id);
      if (c.actualResult === el.value) return;
      await api(`/projects/${state.project.id}/cases/${el.dataset.id}`, {
        method: 'PATCH', body: { actualResult: el.value },
      });
      c.actualResult = el.value;
      toast('Saved');
    };
  });
  $$('.del-case').forEach((el) => {
    el.onclick = async () => {
      if (!confirm('Delete this case?')) return;
      await api(`/projects/${state.project.id}/cases/bulk`, {
        method: 'POST', body: { ids: [el.dataset.id], action: 'delete' },
      });
      state.cases = state.cases.filter((c) => c.id !== el.dataset.id);
      state.expanded = null;
      renderCases();
      toast('Deleted');
    };
  });
  $$('.edit-full').forEach((el) => { el.onclick = () => editCase(el.dataset.id); });
}

function editCase(id) {
  const c = state.cases.find((x) => x.id === id);
  modal(`<h2>Edit ${esc(c.id)}</h2>
    <label>Title</label><input id="e-title" value="${esc(c.title)}">
    <label>Description</label><textarea id="e-desc" rows="2">${esc(c.description)}</textarea>
    <label>Steps — one per line</label>
    <textarea id="e-steps" rows="8">${esc(c.steps.map((s) => s.action).join('\n'))}</textarea>
    <label>Expected result</label><textarea id="e-exp" rows="3">${esc(c.expectedResult)}</textarea>
    <label>Tags — comma separated</label><input id="e-tags" value="${esc((c.tags || []).join(', '))}">
    <div class="row"><button class="primary" id="e-save">Save</button>
    <button class="ghost" onclick="closeModal()">Cancel</button></div>`);

  $('#e-save').onclick = async () => {
    const patch = {
      title: $('#e-title').value,
      description: $('#e-desc').value,
      expectedResult: $('#e-exp').value,
      tags: $('#e-tags').value.split(',').map((s) => s.trim()).filter(Boolean),
      steps: $('#e-steps').value.split('\n').map((a) => a.trim()).filter(Boolean)
        .map((action, i) => ({ step: i + 1, action, data: '' })),
    };
    await api(`/projects/${state.project.id}/cases/${id}`, { method: 'PATCH', body: patch });
    Object.assign(c, patch);
    closeModal();
    renderCases();
    toast('Saved');
  };
}

function renderBulk() {
  const n = state.selected.size;
  $('#bulkbar').hidden = n === 0;
  $('#bulk-count').textContent = `${n} selected`;
}

/* ---------------------------------------------------------------- plan */

async function loadPlan() {
  const { plan } = await api(`/projects/${state.project.id}/plan`);
  $('#plan-editor').value = plan || '';
  $('#plan-status').textContent = plan ? '' : 'Not built yet — press Rebuild.';
}

/* -------------------------------------------------------------- export */

function wireExportLinks() {
  const base = `/api/projects/${state.project.id}`;
  const q = () => {
    const p = new URLSearchParams();
    if ($('#f-page').value) p.set('pageId', $('#f-page').value);
    if ($('#f-category').value) p.set('category', $('#f-category').value);
    if ($('#f-priority').value) p.set('priority', $('#f-priority').value);
    if ($('#f-type').value) p.set('type', $('#f-type').value);
    if ($('#f-smoke').checked) p.set('smoke', 'true');
    const s = p.toString();
    return s ? `?${s}` : '';
  };
  const set = (sel, fmt) => {
    const el = $(sel);
    el.onclick = () => { window.location = `${base}/export/${fmt}${q()}`; };
  };
  set('#x-xlsx', 'xlsx'); set('#x-csv', 'csv'); set('#x-jira', 'jira');
  set('#x-md', 'md'); set('#x-plan', 'plan'); set('#x-json', 'json');
  $('#x-zip').onclick = () => { window.location = `${base}/codegen.zip`; };
  $('#btn-download-plan').onclick = () => { window.location = `${base}/export/plan`; };
}

/* --------------------------------------------------------------- wiring */

function switchTab(name) {
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  $$('.panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === name));
}

function newProjectDialog() {
  modal(`<h2>New project</h2>
    <label>Name *</label><input id="p-name" placeholder="June platform">
    <label>Product</label><input id="p-product" placeholder="Ledgers">
    <label>Description</label><textarea id="p-desc" rows="2"></textarea>
    <label>Dev base URL</label><input id="p-dev" placeholder="https://…">
    <label>UAT base URL</label><input id="p-uat" placeholder="https://…">
    <label>Prod base URL</label><input id="p-prod" placeholder="https://…">
    <label>Page owner GID (numeric, used in the MySQL rows)</label><input id="p-owner" placeholder="1234">
    <label>Created-by GID</label><input id="p-creator" placeholder="1234">
    <div class="row"><button class="primary" id="p-save">Create</button>
    <button class="ghost" onclick="closeModal()">Cancel</button></div>`);

  $('#p-save').onclick = async () => {
    const name = $('#p-name').value.trim();
    if (!name) return toast('Name is required', true);
    try {
      const { project } = await api('/projects', {
        method: 'POST',
        body: {
          name,
          product: $('#p-product').value,
          description: $('#p-desc').value,
          environments: { dev: $('#p-dev').value, uat: $('#p-uat').value, prod: $('#p-prod').value },
        },
      });
      await api(`/projects/${project.id}`, {
        method: 'PATCH',
        body: { defaults: { ...project.defaults, pageOwner: $('#p-owner').value, createdBy: $('#p-creator').value } },
      });
      closeModal();
      await loadProjects();
      await openProject(project.id);
      toast('Project created');
    } catch (err) { toast(err.message, true); }
  };
}

function projectSettings() {
  const p = state.project;
  modal(`<h2>Settings — ${esc(p.name)}</h2>
    <label>Name</label><input id="s-name" value="${esc(p.name)}">
    <label>Product</label><input id="s-product" value="${esc(p.product || '')}">
    <label>Description</label><textarea id="s-desc" rows="2">${esc(p.description || '')}</textarea>
    <label>Dev</label><input id="s-dev" value="${esc(p.environments.dev || '')}">
    <label>UAT</label><input id="s-uat" value="${esc(p.environments.uat || '')}">
    <label>Prod</label><input id="s-prod" value="${esc(p.environments.prod || '')}">
    <label>Page owner GID</label><input id="s-owner" value="${esc(p.defaults?.pageOwner || '')}">
    <label>Created-by GID</label><input id="s-creator" value="${esc(p.defaults?.createdBy || '')}">
    <div class="row"><button class="primary" id="s-save">Save</button>
    <button class="ghost" onclick="closeModal()">Cancel</button></div>`);

  $('#s-save').onclick = async () => {
    await api(`/projects/${p.id}`, {
      method: 'PATCH',
      body: {
        name: $('#s-name').value,
        product: $('#s-product').value,
        description: $('#s-desc').value,
        environments: { dev: $('#s-dev').value, uat: $('#s-uat').value, prod: $('#s-prod').value },
        defaults: { ...p.defaults, pageOwner: $('#s-owner').value, createdBy: $('#s-creator').value },
      },
    });
    closeModal();
    await loadProjects();
    await openProject(p.id);
    toast('Saved');
  };
}

function wireGlobal() {
  $('#btn-new-project').onclick = newProjectDialog;
  $('#btn-first-project').onclick = newProjectDialog;
  $('#btn-project-settings').onclick = projectSettings;

  $('#btn-delete-project').onclick = async () => {
    if (!confirm(`Delete "${state.project.name}" and everything in it?`)) return;
    await api(`/projects/${state.project.id}`, { method: 'DELETE' });
    state.project = null;
    await loadProjects();
    toast('Project deleted');
  };

  $$('.tab').forEach((t) => { t.onclick = () => switchTab(t.dataset.tab); });

  $('#btn-add-pages').onclick = async () => {
    const urls = $('#url-input').value;
    if (!urls.trim()) return toast('Paste at least one URL', true);
    try {
      await api(`/projects/${state.project.id}/pages`, {
        method: 'POST', body: { urls, module: $('#module-input').value },
      });
      $('#url-input').value = '';
      await openProject(state.project.id);
      toast('Pages added — scan them next');
    } catch (err) { toast(err.message, true); }
  };

  ['#f-search', '#f-page', '#f-category', '#f-priority', '#f-type', '#f-source', '#f-smoke']
    .forEach((s) => { $(s).oninput = renderCases; $(s).onchange = renderCases; });

  $('#btn-clear-filters').onclick = () => {
    ['#f-search', '#f-page', '#f-category', '#f-priority', '#f-type', '#f-source']
      .forEach((s) => { $(s).value = ''; });
    $('#f-smoke').checked = false;
    renderCases();
  };

  $('#select-all').onchange = (e) => {
    if (e.target.checked) visibleCases().forEach((c) => state.selected.add(c.id));
    else state.selected.clear();
    renderCases();
  };

  const bulk = async (patch) => {
    await api(`/projects/${state.project.id}/cases/bulk`, {
      method: 'POST', body: { ids: [...state.selected], patch },
    });
    state.cases.forEach((c) => { if (state.selected.has(c.id)) Object.assign(c, patch); });
    renderCases();
    toast(`Updated ${state.selected.size} case(s)`);
  };
  $('#bulk-status').onchange = (e) => { if (e.target.value) bulk({ status: e.target.value }); e.target.value = ''; };
  $('#bulk-priority').onchange = (e) => { if (e.target.value) bulk({ priority: e.target.value }); e.target.value = ''; };
  $('#bulk-type').onchange = (e) => { if (e.target.value) bulk({ type: e.target.value }); e.target.value = ''; };
  $('#bulk-delete').onclick = async () => {
    if (!confirm(`Delete ${state.selected.size} case(s)?`)) return;
    await api(`/projects/${state.project.id}/cases/bulk`, {
      method: 'POST', body: { ids: [...state.selected], action: 'delete' },
    });
    state.cases = state.cases.filter((c) => !state.selected.has(c.id));
    state.selected.clear();
    renderCases();
    toast('Deleted');
  };

  $('#btn-build-plan').onclick = async () => {
    const { plan } = await api(`/projects/${state.project.id}/plan`, { method: 'POST', body: {} });
    $('#plan-editor').value = plan;
    $('#plan-status').textContent = 'Rebuilt from current cases.';
    toast('Test plan rebuilt');
  };
  $('#btn-save-plan').onclick = async () => {
    await api(`/projects/${state.project.id}/plan`, { method: 'POST', body: { markdown: $('#plan-editor').value } });
    $('#plan-status').textContent = 'Saved.';
    toast('Plan saved');
  };
  $('#btn-summary').onclick = async () => {
    const { summary } = await api(`/projects/${state.project.id}/summary`);
    $('#plan-editor').value = summary;
    $('#plan-status').textContent = 'Summary report loaded — save to keep it.';
  };

  $('#btn-codegen-disk').onclick = async () => {
    $('#codegen-status').innerHTML = '<span class="spinner"></span>';
    try {
      const r = await api(`/projects/${state.project.id}/codegen`, { method: 'POST', body: {} });
      $('#codegen-status').textContent = `${r.files.length} files written to ${r.outDir}`;
      toast('Suite written');
    } catch (err) {
      $('#codegen-status').textContent = '';
      toast(err.message, true);
    }
  };

  $('#import-file').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const body = JSON.parse(await file.text());
      const { project } = await api('/import/project', { method: 'POST', body });
      await loadProjects();
      await openProject(project.id);
      toast('Backup restored');
    } catch (err) { toast(`Restore failed: ${err.message}`, true); }
    e.target.value = '';
  };

  $('#btn-theme').onclick = () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('qa-theme', next);
  };

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
      e.preventDefault();
      switchTab('cases');
      $('#f-search').focus();
    }
  });
}

window.closeModal = closeModal;
boot();

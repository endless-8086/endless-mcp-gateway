const state = {
  servers: [],
  tools: [],
  tags: [],
  toolPage: 1,
  toolPageSize: 20,
  toolTagFilter: '',
  toolServerFilter: '',
  toolTotal: 0,
  toolTotalPages: 1,
  serverFilter: 'all',
  editingServer: null,
  editingTool: null,
  editingTag: null
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const __ = (key, subs) => window.__ ? window.__(key, subs) : key;

window.addEventListener('i18n-changed', () => {
  renderAll();
  showView(document.querySelector('.nav-item.active')?.dataset?.view || 'overview');
  setTokenVisibility($('#token-input')?.type === 'text');
});


function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function token() { return localStorage.getItem('mcp-admin-token') || ''; }

async function api(path, options = {}) {
  const headers = { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) };
  if (token()) headers.Authorization = `Bearer ${token()}`;
  const response = await fetch(path, { ...options, headers });
  const contentType = response.headers.get('content-type') || '';
  const body = response.status === 204 ? null : contentType.includes('json') ? await response.json() : await response.text();
  if (!response.ok) throw new Error(typeof body === 'object' ? body.error || __('api_error', {0: response.status}) : body || __('api_error', {0: response.status}));
  return body;
}

function toast(message, isError = false) {
  const region = $('#toast-region');
  const item = document.createElement('div');
  item.className = `toast${isError ? ' error' : ''}`;
  item.textContent = message;
  region.append(item);
  setTimeout(() => item.remove(), 3800);
}

function statusLabel(status, enabled) {
  if (!enabled) return [__('status_disabled'), 'disabled'];
  const map = { READY: [__('status_ready'), 'ready'], STARTING: [__('status_starting'), 'starting'], DEGRADED: [__('status_degraded'), 'degraded'], FAILED: [__('status_failed'), 'failed'], STOPPING: [__('status_stopping'), 'starting'], STOPPED: [__('status_stopped'), 'stopped'] };
  return map[status] || [__('status_unknown'), 'stopped'];
}

function statusBadge(server) {
  const [label, className] = statusLabel(server.status, server.enabled);
  return `<span class="status-badge status-${className}">${label}</span>`;
}

function typeBadge(type) {
  return `<span class="type-badge">${type === 'streamable-http' ? 'Streamable HTTP' : type.toUpperCase()}</span>`;
}

function formatDate(value) {
  if (!value) return __('never_connected');
  try { return new Intl.DateTimeFormat((window.i18n&&window.i18n.lang==='zh')?'zh-CN':'en-US', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); } catch { return value; }
}

function toolListUrl() {
  const params = new URLSearchParams({ includeDisabled: 'true', paginate: 'true', page: String(state.toolPage), pageSize: String(state.toolPageSize) });
  const search = ($('#tool-search')?.value || '').trim();
  const tag = state.toolTagFilter;
  const serverId = state.toolServerFilter;
  if (search) params.set('search', search);
  if (tag) params.set('tag', tag);
  if (serverId) params.set('serverId', serverId);
  return `/api/v1/tools?${params.toString()}`;
}

function filterSelectMarkup(key, options, selected, className = '') {
  const selectedOption = options.find((option) => option.value === selected) ?? options[0];
  return `<div class="filter-select ${className}" data-filter-select="${key}"><button class="filter-select-trigger" type="button" data-filter-select-trigger="${key}" aria-haspopup="listbox" aria-expanded="false"><span>${esc(selectedOption.label)}</span><span class="filter-select-chevron" aria-hidden="true"></span></button><div class="filter-select-menu" role="listbox" hidden>${options.map((option) => `<button class="filter-select-option" type="button" role="option" data-filter-select-option="${key}" data-filter-value="${esc(option.value)}" aria-selected="${option.value === selected}">${esc(option.label)}</button>`).join('')}</div></div>`;
}

function renderToolFilters() {
  const tagOptions = [{ value: '', label: __('filter_all_tags') }, ...state.tags.filter((tag) => tag.enabled).map((tag) => ({ value: tag.name, label: tag.displayName || tag.name }))];
  const serverOptions = [{ value: '', label: __('filter_all_servers') }, ...state.servers.map((server) => ({ value: server.id, label: server.name }))];
  if (!tagOptions.some((option) => option.value === state.toolTagFilter)) state.toolTagFilter = '';
  if (!serverOptions.some((option) => option.value === state.toolServerFilter)) state.toolServerFilter = '';
  $('#tool-tag-filter').innerHTML = filterSelectMarkup('tag', tagOptions, state.toolTagFilter);
  $('#tool-server-filter').innerHTML = filterSelectMarkup('server', serverOptions, state.toolServerFilter);
}

function closeFilterSelects(except) {
  $$('.filter-select').forEach((select) => {
    if (select === except) return;
    select.querySelector('.filter-select-menu').hidden = true;
    select.querySelector('.filter-select-trigger').setAttribute('aria-expanded', 'false');
  });
}

async function loadAll(showMessage = false) {
  try {
    const [servers, toolsPage, tags] = await Promise.all([
      api('/api/v1/servers'),
      api(toolListUrl()),
      api('/api/v1/tags')
    ]);
    state.servers = servers || [];
    state.tools = Array.isArray(toolsPage) ? toolsPage : (toolsPage?.items || []);
    state.toolTotal = Array.isArray(toolsPage) ? state.tools.length : (toolsPage?.total ?? state.tools.length);
    state.toolPage = Array.isArray(toolsPage) ? 1 : (toolsPage?.page ?? state.toolPage);
    state.toolPageSize = Array.isArray(toolsPage) ? state.toolPageSize : (toolsPage?.pageSize ?? state.toolPageSize);
    state.toolTotalPages = Array.isArray(toolsPage) ? 1 : (toolsPage?.totalPages ?? 1);
    state.tags = tags || [];
    renderAll();
    if (showMessage) toast(__('toast_data_refreshed'));
  } catch (error) {
    toast(error.message || __('toast_load_failed'), true);
  }
}

function renderAll() {
  renderEndpointUrls();
  renderOverview();
  renderServers();
  renderTools();
  renderTags();
}

function renderOverview() {
  const enabledServers = state.servers.filter((server) => server.enabled);
  const enabledTools = state.tools.filter((tool) => tool.enabled && !tool.orphaned);
  $('#metric-servers').textContent = enabledServers.length;
  $('#metric-servers-sub').textContent = __('metric_sub_servers', {0: state.servers.length});
  $('#metric-tools').textContent = enabledTools.length;
  $('#metric-tools-sub').textContent = __('metric_sub_tools', {0: state.tools.length});
  $('#metric-tags').textContent = state.tags.filter((tag) => tag.enabled).length;
  const list = state.servers.filter((server) => server.enabled).slice(0, 3);
  $('#overview-servers').innerHTML = list.length ? list.map((server) => `<article class="server-mini"><div class="server-mini-top"><strong>${esc(server.name)}</strong>${statusBadge(server)}</div><p>${esc(server.id)} · ${esc(server.lastError || __('normal_status'))}</p><div class="server-mini-meta">${typeBadge(server.type)}<span>${__('last_connected', {0: formatDate(server.lastConnectedAt)})}</span></div></article>`).join('') : `<div class="data-card empty-state"><strong>${__('overview_empty_title')}</strong>${__('overview_empty_desc')}</div>`;
}

function renderServers() {
  const search = ($('#server-search')?.value || '').trim().toLowerCase();
  const filtered = state.servers.filter((server) => {
    const matchesSearch = !search || `${server.id} ${server.name} ${server.type}`.toLowerCase().includes(search);
    const matchesFilter = state.serverFilter === 'all' || (state.serverFilter === 'ready' && server.enabled && server.status === 'READY') || (state.serverFilter === 'disabled' && !server.enabled);
    return matchesSearch && matchesFilter;
  });
  $$('.filter-pill').forEach((button) => button.classList.toggle('active', button.dataset.serverFilter === state.serverFilter));
  const container = $('#servers-table');
  if (!filtered.length) { container.innerHTML = `<div class="empty-state"><strong>${__('servers_empty_title')}</strong>${__('servers_empty_desc')}</div>`; return; }
  container.innerHTML = `<div class="table-scroll"><table class="data-table"><thead><tr><th>${__('table_server')}</th><th>${__('table_type')}</th><th>${__('table_status')}</th><th>${__('table_last_connect')}</th><th>${__('table_version')}</th><th></th></tr></thead><tbody>${filtered.map((server) => `<tr><td class="primary-cell">${esc(server.name)}<span class="sub-cell">${esc(server.id)}</span></td><td>${typeBadge(server.type)}</td><td>${statusBadge(server)}${server.lastError ? `<span class="sub-cell" title="${esc(server.lastError)}">${esc(server.lastError).slice(0, 42)}</span>` : ''}</td><td>${formatDate(server.lastConnectedAt)}</td><td>v${server.version || 1}</td><td><div class="actions-cell"><button class="table-button" data-server-action="edit" data-server-id="${esc(server.id)}">${__('btn_edit')}</button><button class="table-button" data-server-action="refresh" data-server-id="${esc(server.id)}">${__('btn_refresh')}</button><button class="table-button" data-server-action="toggle" data-server-id="${esc(server.id)}">${server.enabled ? __('btn_disable') : __('btn_enable')}</button><button class="table-button danger" data-server-action="delete" data-server-id="${esc(server.id)}">${__('btn_delete')}</button></div></td></tr>`).join('')}</tbody></table></div>`;
}

function renderTools() {
  const filtered = state.tools;
  renderToolFilters();
  if (!filtered.length) { $('#tools-table').innerHTML = `<div class="empty-state"><strong>${__('tools_empty_title')}</strong>${__('tools_empty_desc')}</div>`; return; }
  const from = state.toolTotal ? (state.toolPage - 1) * state.toolPageSize + 1 : 0;
  const to = Math.min(state.toolTotal, state.toolPage * state.toolPageSize);
  const pageSizeOptions = [20, 50, 100].map((value) => ({ value: String(value), label: __('page_size', {0: value}) }));
  $('#tools-table').innerHTML = `<div class="table-scroll"><table class="data-table"><thead><tr><th>${__('table_tool')}</th><th>${__('table_server')}</th><th>${__('table_tags')}</th><th>${__('table_status')}</th><th>${__('table_params')}</th><th></th></tr></thead><tbody>${filtered.map((tool) => `<tr><td class="primary-cell">${esc(tool.displayName || tool.exposedName)}<span class="sub-cell">${esc(tool.exposedName)}${tool.descriptionOverride || tool.upstreamDescription ? ` · ${esc(tool.descriptionOverride || tool.upstreamDescription).slice(0, 40)}` : ''}</span></td><td>${esc(state.servers.find((server) => server.id === tool.serverId)?.name || tool.serverId)}</td><td>${tool.tags.length ? tool.tags.map((item) => `<span class="tag-chip">#${esc(item)}</span>`).join(' ') : `<span class="tag-chip muted-chip">${__('no_category')}</span>`}</td><td><span class="status-badge status-${tool.enabled && !tool.orphaned ? 'ready' : 'disabled'}">${tool.orphaned ? __('status_orphaned') : tool.enabled ? __('status_enabled') : __('status_disabled')}</span></td><td>${Object.keys(tool.inputSchema || {}).length ? __('params_schema') : __('no_params')}</td><td><div class="actions-cell"><button class="table-button" data-tool-action="edit" data-server-id="${esc(tool.serverId)}" data-tool-name="${esc(tool.upstreamName)}">${__('btn_edit')}</button><button class="table-button" data-tool-action="toggle" data-server-id="${esc(tool.serverId)}" data-tool-name="${esc(tool.upstreamName)}">${tool.enabled ? __('btn_disable') : __('btn_enable')}</button></div></td></tr>`).join('')}</tbody></table></div><div class="pagination-bar"><span>${__('pagination_range', {0: from, 1: to, 2: state.toolTotal})}</span><div class="pagination-controls">${filterSelectMarkup('page-size', pageSizeOptions, String(state.toolPageSize), 'pagination-select')}<button class="table-button" data-tool-page="prev" ${state.toolPage <= 1 ? 'disabled' : ''}>${__('pagination_prev')}</button><span>${__('pagination_page', {0: state.toolPage, 1: state.toolTotalPages})}</span><button class="table-button" data-tool-page="next" ${state.toolPage >= state.toolTotalPages ? 'disabled' : ''}>${__('pagination_next')}</button></div></div>`;
}

function renderTags() {
  const countByTag = new Map(state.tags.map((tag) => [tag.name, state.tools.filter((tool) => tool.tags.includes(tag.name)).length]));
  $('#tag-summary').textContent = __('tags_summary', {0: state.tags.length, 1: state.tools.filter((tool) => tool.tags.length).length});
  $('#tags-grid').innerHTML = state.tags.length ? state.tags.map((tag) => `<article class="tag-card"><div class="tag-card-top"><h3><span class="tag-chip">#${esc(tag.name)}</span></h3><div class="actions-cell"><button class="table-button" data-tag-action="edit" data-tag-name="${esc(tag.name)}">${__('btn_edit')}</button><button class="table-button danger" data-tag-action="delete" data-tag-name="${esc(tag.name)}">${__('btn_delete')}</button></div></div><p>${esc(tag.description || __('tags_no_desc'))}</p><div class="tag-card-footer"><span>${esc(tag.displayName || tag.name)}</span><span>${__('tags_count', {0: countByTag.get(tag.name) || 0})}</span></div></article>`).join('') : `<div class="empty-state"><strong>${__('tags_empty_title')}</strong>${__('tags_empty_desc')}</div>`;
}

function showView(view) {
  $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === view));
  $$('.view').forEach((item) => item.classList.toggle('active-view', item.id === `view-${view}`));
}

function renderEndpointUrls() {
  $$('[data-endpoint-path]').forEach((element) => {
    element.textContent = `${window.location.origin}${element.dataset.endpointPath}`;
  });
}

function serverDialog(server = null) {
  state.editingServer = server;
  const dialog = $('#server-dialog');
  const form = $('#server-form');
  form.reset();
  $('#server-dialog-title').textContent = server ? __('dialog_edit_server', {0: server.name}) : __('dialog_add_server');
  if (server) {
    for (const [key, value] of Object.entries({ id: server.id, name: server.name, type: server.type, enabled: String(server.enabled), timeoutMs: server.timeoutMs ?? '', command: server.command || '', args: JSON.stringify(server.args || []), cwd: server.cwd || '', url: server.url || '', headers: JSON.stringify(server.headers || {}) })) {
      if (form.elements[key]) form.elements[key].value = value;
    }
    form.elements.id.readOnly = true;
  } else form.elements.id.readOnly = false;
  updateConditionalFields();
  dialog.showModal();
}

function updateConditionalFields() {
  const type = $('#server-form').elements.type.value;
  $$('.conditional-stdio').forEach((item) => item.hidden = type !== 'stdio');
  $$('.conditional-remote').forEach((item) => item.hidden = type === 'stdio');
}

function toolDialog(tool) {
  state.editingTool = tool;
  const form = $('#tool-form');
  form.reset();
  $('#tool-dialog-subtitle').textContent = tool.exposedName;
  form.elements.displayName.value = tool.displayName || '';
  form.elements.descriptionOverride.value = tool.descriptionOverride || '';
  form.elements.timeoutMs.value = tool.timeoutMs ?? '';
  form.elements.concurrencyLimit.value = tool.concurrencyLimit ?? '';
  $('#tool-tag-options').innerHTML = state.tags.length ? state.tags.map((tag) => `<label class="tag-option"><input type="checkbox" value="${esc(tag.name)}" ${tool.tags.includes(tag.name) ? 'checked' : ''} />#${esc(tag.name)}</label>`).join('') : `<span class="muted">${__('tags_create_first')}</span>`;
  $('#tool-dialog').showModal();
}

function tagDialog(tag) {
  state.editingTag = tag;
  const form = $('#tag-edit-form');
  form.reset();
  $('#tag-edit-dialog-title').textContent = __('dialog_edit_tag', {0: tag.name});
  $('#tag-edit-name').textContent = tag.name;
  form.elements.displayName.value = tag.displayName || '';
  form.elements.description.value = tag.description || '';
  $('#tag-edit-dialog').showModal();
}

async function handleServerAction(action, serverId) {
  const server = state.servers.find((item) => item.id === serverId);
  if (!server) return;
  try {
    if (action === 'edit') { serverDialog(server); return; }
    if (action === 'toggle') await api(`/api/v1/servers/${encodeURIComponent(serverId)}/${server.enabled ? 'disable' : 'enable'}`, { method: 'POST' });
    if (action === 'refresh') { await api(`/api/v1/servers/${encodeURIComponent(serverId)}/refresh`, { method: 'POST' }); toast(__('toast_tools_refreshed')); }
    if (action === 'delete') { if (!confirm(`${__('dialog_delete_confirm', {0: server.name})}`)) return; await api(`/api/v1/servers/${encodeURIComponent(serverId)}`, { method: 'DELETE' }); toast(__('toast_server_deleted')); }
    if (action !== 'edit') await loadAll();
  } catch (error) { toast(error.message, true); }
}

async function handleToolAction(action, serverId, toolName) {
  const tool = state.tools.find((item) => item.serverId === serverId && item.upstreamName === toolName);
  if (!tool) return;
  try {
    if (action === 'edit') { toolDialog(tool); return; }
    const updated = await api(`/api/v1/servers/${encodeURIComponent(serverId)}/tools/${encodeURIComponent(toolName)}`, { method: 'PUT', body: JSON.stringify({ enabled: !tool.enabled }) });
    const idx = state.tools.findIndex(t => t.serverId === serverId && t.upstreamName === toolName);
    if (idx >= 0 && updated) state.tools[idx] = { ...state.tools[idx], ...updated };
    renderAll();
  } catch (error) { toast(error.message, true); }
}

$('#token-input').value = token();
$('#save-token').addEventListener('click', () => { localStorage.setItem('mcp-admin-token', $('#token-input').value.trim()); toast(__('toast_token_saved')); loadAll(); });
const tokenInput = $('#token-input');
const tokenVisibility = $('#toggle-token-visibility');
function setTokenVisibility(visible) {
  tokenInput.type = visible ? 'text' : 'password';
  tokenVisibility.classList.toggle('is-visible', visible);
  tokenVisibility.setAttribute('aria-pressed', String(visible));
  const label = __(visible ? 'token_hide' : 'token_show');
  tokenVisibility.setAttribute('aria-label', label);
  tokenVisibility.title = label;
}
tokenVisibility.addEventListener('click', () => setTokenVisibility(tokenInput.type === 'password'));
$('#refresh-all').addEventListener('click', () => loadAll(true));
$('#refresh-tools').addEventListener('click', async () => { try { await Promise.all(state.servers.filter((server) => server.enabled).map((server) => api(`/api/v1/servers/${encodeURIComponent(server.id)}/refresh`, { method: 'POST' }))); await loadAll(); toast(__('toast_all_refreshed')); } catch (error) { toast(error.message, true); } });
document.addEventListener('click', (event) => {
  const filterTrigger = event.target.closest('[data-filter-select-trigger]');
  if (filterTrigger) {
    const select = filterTrigger.closest('[data-filter-select]');
    const menu = select.querySelector('.filter-select-menu');
    const willOpen = menu.hidden;
    closeFilterSelects(select);
    menu.hidden = !willOpen;
    filterTrigger.setAttribute('aria-expanded', String(willOpen));
    return;
  }
  const filterOption = event.target.closest('[data-filter-select-option]');
  if (filterOption) {
    const key = filterOption.dataset.filterSelectOption;
    const value = filterOption.dataset.filterValue || '';
    if (key === 'tag') state.toolTagFilter = value;
    if (key === 'server') state.toolServerFilter = value;
    if (key === 'page-size') state.toolPageSize = Number(value) || 20;
    closeFilterSelects();
    state.toolPage = 1;
    loadAll();
    return;
  }
  if (!event.target.closest('.filter-select')) closeFilterSelects();
  const target = event.target.closest('[data-view]');
  if (target) showView(target.dataset.view);
  const viewTarget = event.target.closest('[data-view-target]');
  if (viewTarget) showView(viewTarget.dataset.viewTarget);
  const serverAction = event.target.closest('[data-server-action]');
  if (serverAction) handleServerAction(serverAction.dataset.serverAction, serverAction.dataset.serverId);
  const toolAction = event.target.closest('[data-tool-action]');
  if (toolAction) handleToolAction(toolAction.dataset.toolAction, toolAction.dataset.serverId, toolAction.dataset.toolName);
  const toolPageButton = event.target.closest('[data-tool-page]');
  if (toolPageButton && !toolPageButton.disabled) {
    state.toolPage += toolPageButton.dataset.toolPage === 'next' ? 1 : -1;
    loadAll();
  }
  const tagAction = event.target.closest('[data-tag-action]');
  if (tagAction?.dataset.tagAction === 'edit') {
    const tag = state.tags.find((item) => item.name === tagAction.dataset.tagName);
    if (tag) tagDialog(tag);
  }
  if (tagAction?.dataset.tagAction === 'delete') deleteTag(tagAction.dataset.tagName);
  const close = event.target.closest('[data-close-dialog]');
  if (close) $(`#${close.dataset.closeDialog}`).close();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeFilterSelects();
});

$('#add-server').addEventListener('click', () => serverDialog());
$('#server-form').elements.type.addEventListener('change', updateConditionalFields);
$('#server-search').addEventListener('input', renderServers);
let toolSearchTimer;
$('#tool-search').addEventListener('input', () => {
  state.toolPage = 1;
  clearTimeout(toolSearchTimer);
  toolSearchTimer = setTimeout(() => loadAll(), 250);
});
$('#server-filters').addEventListener('click', (event) => { const button = event.target.closest('[data-server-filter]'); if (!button) return; state.serverFilter = button.dataset.serverFilter; renderServers(); });

$('#server-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  try {
    const args = data.args ? JSON.parse(data.args) : [];
    const headers = data.headers ? JSON.parse(data.headers) : {};
    if (!Array.isArray(args) || typeof headers !== 'object' || Array.isArray(headers)) throw new Error('Args must be an array, Headers must be a JSON object');
    const timeoutMs = data.timeoutMs === '' ? null : Number(data.timeoutMs);
    if (timeoutMs !== null && (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 3600000)) throw new Error(__('server_timeout_invalid'));
    const payload = { id: data.id, name: data.name, type: data.type, enabled: data.enabled === 'true', timeoutMs, command: data.command || undefined, args, cwd: data.cwd || undefined, url: data.url || undefined, headers };
    await api(state.editingServer ? `/api/v1/servers/${encodeURIComponent(state.editingServer.id)}` : '/api/v1/servers', { method: state.editingServer ? 'PUT' : 'POST', body: JSON.stringify({ ...payload, ...(state.editingServer ? { version: state.editingServer.version } : {}) }) });
    $('#server-dialog').close();
    toast(state.editingServer ? __('toast_server_updated') : __('toast_server_added'));
    state.editingServer = null;
    await loadAll();
  } catch (error) { toast(error.message === 'VERSION_CONFLICT' ? __('toast_version_conflict_server') : error.message, true); }
});

$('#tool-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const tool = state.editingTool;
  const form = event.currentTarget;
  if (!tool) return;
  const data = Object.fromEntries(new FormData(form).entries());
  const nullableNumber = (value) => value === '' ? null : Number(value);
  const displayName = data.displayName?.trim() || null;
  const descriptionOverride = data.descriptionOverride?.trim() || null;
  const timeoutMs = nullableNumber(data.timeoutMs);
  const concurrencyLimit = nullableNumber(data.concurrencyLimit);
  const metadataChanged = displayName !== (tool.displayName || null)
    || descriptionOverride !== (tool.descriptionOverride || null)
    || timeoutMs !== (tool.timeoutMs ?? null)
    || concurrencyLimit !== (tool.concurrencyLimit ?? null);
  try {
    const tags = $$('#tool-tag-options input:checked').map((item) => item.value);
    if (metadataChanged) {
      await api(`/api/v1/servers/${encodeURIComponent(tool.serverId)}/tools/${encodeURIComponent(tool.upstreamName)}`, { method: 'PUT', body: JSON.stringify({ displayName, descriptionOverride, timeoutMs, concurrencyLimit }) });
    }
    await api(`/api/v1/servers/${encodeURIComponent(tool.serverId)}/tools/${encodeURIComponent(tool.upstreamName)}/tags`, { method: 'PUT', body: JSON.stringify({ tags }) });
    $('#tool-dialog').close();
    state.editingTool = null;
    toast(__('toast_tool_updated'));
    await loadAll();
  } catch (error) { toast(error.message === 'VERSION_CONFLICT' ? __('toast_version_conflict_tool') : error.message, true); }
});

$('#tag-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  try { await api('/api/v1/tags', { method: 'POST', body: JSON.stringify(data) }); form.reset(); toast(__('toast_tag_created')); await loadAll(); } catch (error) { toast(error.message, true); }
});

$('#tag-edit-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const tag = state.editingTag;
  if (!tag) return;
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  try {
    await api(`/api/v1/tags/${encodeURIComponent(tag.name)}`, { method: 'PUT', body: JSON.stringify({ displayName: data.displayName?.trim() || null, description: data.description?.trim() || null }) });
    $('#tag-edit-dialog').close();
    state.editingTag = null;
    toast(__('toast_tag_updated'));
    await loadAll();
  } catch (error) { toast(error.message, true); }
});

async function deleteTag(name) {
  if (!confirm(`${__('tags_delete_confirm', {0: name})}`)) return;
  try { await api(`/api/v1/tags/${encodeURIComponent(name)}`, { method: 'DELETE' }); toast(__('toast_tag_deleted')); await loadAll(); } catch (error) { toast(error.message, true); }
}

renderEndpointUrls();
loadAll();

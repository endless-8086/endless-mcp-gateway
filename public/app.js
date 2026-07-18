const state = {
  servers: [],
  tools: [],
  tags: [],
  toolPage: 1,
  toolPageSize: 20,
  toolTotal: 0,
  toolTotalPages: 1,
  serverFilter: 'all',
  editingServer: null,
  editingTool: null
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

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
  if (!response.ok) throw new Error(typeof body === 'object' ? body.error || `请求失败（${response.status}）` : body || `请求失败（${response.status}）`);
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
  if (!enabled) return ['已停用', 'disabled'];
  const map = { READY: ['运行中', 'ready'], STARTING: ['连接中', 'starting'], DEGRADED: ['降级', 'degraded'], FAILED: ['失败', 'failed'], STOPPING: ['停止中', 'starting'], STOPPED: ['已停止', 'stopped'] };
  return map[status] || ['未知', 'stopped'];
}

function statusBadge(server) {
  const [label, className] = statusLabel(server.status, server.enabled);
  return `<span class="status-badge status-${className}">${label}</span>`;
}

function typeBadge(type) {
  return `<span class="type-badge">${type === 'streamable-http' ? 'Streamable HTTP' : type.toUpperCase()}</span>`;
}

function formatDate(value) {
  if (!value) return '尚未连接';
  try { return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); } catch { return value; }
}

function toolListUrl() {
  const params = new URLSearchParams({ includeDisabled: 'true', paginate: 'true', page: String(state.toolPage), pageSize: String(state.toolPageSize) });
  const search = ($('#tool-search')?.value || '').trim();
  const tag = $('#tool-tag-filter')?.value || '';
  const serverId = $('#tool-server-filter')?.value || '';
  if (search) params.set('search', search);
  if (tag) params.set('tag', tag);
  if (serverId) params.set('serverId', serverId);
  return `/api/v1/tools?${params.toString()}`;
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
    if (showMessage) toast('数据已刷新');
  } catch (error) {
    toast(error.message || '无法加载控制面数据', true);
  }
}

function renderAll() {
  renderOverview();
  renderServers();
  renderTools();
  renderTags();
}

function renderOverview() {
  const enabledServers = state.servers.filter((server) => server.enabled);
  const enabledTools = state.tools.filter((tool) => tool.enabled && !tool.orphaned);
  $('#metric-servers').textContent = enabledServers.length;
  $('#metric-servers-sub').textContent = `${state.servers.length} 个已配置`;
  $('#metric-tools').textContent = enabledTools.length;
  $('#metric-tools-sub').textContent = `${state.tools.length} 个已发现`;
  $('#metric-tags').textContent = state.tags.filter((tag) => tag.enabled).length;
  const list = state.servers.filter((server) => server.enabled).slice(0, 3);
  $('#overview-servers').innerHTML = list.length ? list.map((server) => `<article class="server-mini"><div class="server-mini-top"><strong>${esc(server.name)}</strong>${statusBadge(server)}</div><p>${esc(server.id)} · ${esc(server.lastError || '连接状态正常')}</p><div class="server-mini-meta">${typeBadge(server.type)}<span>最后连接 ${formatDate(server.lastConnectedAt)}</span></div></article>`).join('') : '<div class="data-card empty-state"><strong>还没有启用的上游服务</strong>去“上游服务”添加第一个 MCP 服务。</div>';
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
  if (!filtered.length) { container.innerHTML = '<div class="empty-state"><strong>没有匹配的上游服务</strong>调整筛选条件或添加一个新服务。</div>'; return; }
  container.innerHTML = `<div class="table-scroll"><table class="data-table"><thead><tr><th>服务</th><th>类型</th><th>状态</th><th>最后连接</th><th>版本</th><th></th></tr></thead><tbody>${filtered.map((server) => `<tr><td class="primary-cell">${esc(server.name)}<span class="sub-cell">${esc(server.id)}</span></td><td>${typeBadge(server.type)}</td><td>${statusBadge(server)}${server.lastError ? `<span class="sub-cell" title="${esc(server.lastError)}">${esc(server.lastError).slice(0, 42)}</span>` : ''}</td><td>${formatDate(server.lastConnectedAt)}</td><td>v${server.version || 1}</td><td><div class="actions-cell"><button class="table-button" data-server-action="edit" data-server-id="${esc(server.id)}">编辑</button><button class="table-button" data-server-action="refresh" data-server-id="${esc(server.id)}">刷新</button><button class="table-button" data-server-action="toggle" data-server-id="${esc(server.id)}">${server.enabled ? '停用' : '启用'}</button><button class="table-button danger" data-server-action="delete" data-server-id="${esc(server.id)}">删除</button></div></td></tr>`).join('')}</tbody></table></div>`;
}

function renderTools() {
  const filtered = state.tools;
  const tagSelect = $('#tool-tag-filter');
  const currentTag = tagSelect.value;
  tagSelect.innerHTML = '<option value="">所有标签</option>' + state.tags.filter((item) => item.enabled).map((item) => `<option value="${esc(item.name)}">${esc(item.displayName || item.name)}</option>`).join('');
  tagSelect.value = currentTag;
  const serverSelect = $('#tool-server-filter');
  const currentServer = serverSelect.value;
  serverSelect.innerHTML = '<option value="">所有服务</option>' + state.servers.map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('');
  serverSelect.value = currentServer;
  if (!filtered.length) { $('#tools-table').innerHTML = '<div class="empty-state"><strong>没有匹配的工具</strong>刷新上游服务，或调整搜索和标签筛选。</div>'; return; }
  const from = state.toolTotal ? (state.toolPage - 1) * state.toolPageSize + 1 : 0;
  const to = Math.min(state.toolTotal, state.toolPage * state.toolPageSize);
  $('#tools-table').innerHTML = `<div class="table-scroll"><table class="data-table"><thead><tr><th>工具</th><th>服务</th><th>标签</th><th>状态</th><th>参数</th><th></th></tr></thead><tbody>${filtered.map((tool) => `<tr><td class="primary-cell">${esc(tool.displayName || tool.exposedName)}<span class="sub-cell">${esc(tool.exposedName)}${tool.descriptionOverride || tool.upstreamDescription ? ` · ${esc(tool.descriptionOverride || tool.upstreamDescription).slice(0, 40)}` : ''}</span></td><td>${esc(state.servers.find((server) => server.id === tool.serverId)?.name || tool.serverId)}</td><td>${tool.tags.length ? tool.tags.map((item) => `<span class="tag-chip">#${esc(item)}</span>`).join(' ') : '<span class="tag-chip muted-chip">未分类</span>'}</td><td><span class="status-badge status-${tool.enabled && !tool.orphaned ? 'ready' : 'disabled'}">${tool.orphaned ? '已下线' : tool.enabled ? '已启用' : '已停用'}</span></td><td>${Object.keys(tool.inputSchema || {}).length ? 'JSON Schema' : '无参数'}</td><td><div class="actions-cell"><button class="table-button" data-tool-action="edit" data-server-id="${esc(tool.serverId)}" data-tool-name="${esc(tool.upstreamName)}">编辑</button><button class="table-button" data-tool-action="toggle" data-server-id="${esc(tool.serverId)}" data-tool-name="${esc(tool.upstreamName)}">${tool.enabled ? '停用' : '启用'}</button></div></td></tr>`).join('')}</tbody></table></div><div class="pagination-bar"><span>显示 ${from}–${to} / 共 ${state.toolTotal} 个工具</span><div class="pagination-controls"><select id="tool-page-size" class="select-control" aria-label="每页条数"><option value="20" ${state.toolPageSize === 20 ? 'selected' : ''}>每页 20</option><option value="50" ${state.toolPageSize === 50 ? 'selected' : ''}>每页 50</option><option value="100" ${state.toolPageSize === 100 ? 'selected' : ''}>每页 100</option></select><button class="table-button" data-tool-page="prev" ${state.toolPage <= 1 ? 'disabled' : ''}>上一页</button><span>第 ${state.toolPage} / ${state.toolTotalPages} 页</span><button class="table-button" data-tool-page="next" ${state.toolPage >= state.toolTotalPages ? 'disabled' : ''}>下一页</button></div></div>`;
}

function renderTags() {
  const countByTag = new Map(state.tags.map((tag) => [tag.name, state.tools.filter((tool) => tool.tags.includes(tag.name)).length]));
  $('#tag-summary').textContent = `${state.tags.length} 个标签 · ${state.tools.filter((tool) => tool.tags.length).length} 个已分类工具`;
  $('#tags-grid').innerHTML = state.tags.length ? state.tags.map((tag) => `<article class="tag-card"><div class="tag-card-top"><h3><span class="tag-chip">#${esc(tag.name)}</span></h3><button class="table-button danger" data-tag-action="delete" data-tag-name="${esc(tag.name)}">删除</button></div><p>${esc(tag.description || '暂无描述')}</p><div class="tag-card-footer"><span>${esc(tag.displayName || tag.name)}</span><span>${countByTag.get(tag.name) || 0} 个工具</span></div></article>`).join('') : '<div class="empty-state"><strong>还没有标签</strong>创建标签后，可以在工具编辑器中分配。</div>';
}

function showView(view) {
  $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === view));
  $$('.view').forEach((item) => item.classList.toggle('active-view', item.id === `view-${view}`));
  const titles = { overview: '网关总览', servers: '上游服务', tools: '工具目录', tags: '标签管理' };
  $('#page-title').textContent = titles[view] || '网关总览';
}

function serverDialog(server = null) {
  state.editingServer = server;
  const dialog = $('#server-dialog');
  const form = $('#server-form');
  form.reset();
  $('#server-dialog-title').textContent = server ? `编辑 ${server.name}` : '添加上游服务';
  if (server) {
    for (const [key, value] of Object.entries({ id: server.id, name: server.name, type: server.type, enabled: String(server.enabled), command: server.command || '', args: JSON.stringify(server.args || []), cwd: server.cwd || '', url: server.url || '', headers: JSON.stringify(server.headers || {}) })) {
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
  $('#tool-tag-options').innerHTML = state.tags.length ? state.tags.map((tag) => `<label class="tag-option"><input type="checkbox" value="${esc(tag.name)}" ${tool.tags.includes(tag.name) ? 'checked' : ''} />#${esc(tag.name)}</label>`).join('') : '<span class="muted">先创建标签</span>';
  $('#tool-dialog').showModal();
}

async function handleServerAction(action, serverId) {
  const server = state.servers.find((item) => item.id === serverId);
  if (!server) return;
  try {
    if (action === 'edit') { serverDialog(server); return; }
    if (action === 'toggle') await api(`/api/v1/servers/${encodeURIComponent(serverId)}/${server.enabled ? 'disable' : 'enable'}`, { method: 'POST' });
    if (action === 'refresh') { await api(`/api/v1/servers/${encodeURIComponent(serverId)}/refresh`, { method: 'POST' }); toast('工具目录刷新完成'); }
    if (action === 'delete') { if (!confirm(`确定删除“${server.name}”吗？`)) return; await api(`/api/v1/servers/${encodeURIComponent(serverId)}`, { method: 'DELETE' }); toast('服务已删除'); }
    if (action !== 'edit') await loadAll();
  } catch (error) { toast(error.message, true); }
}

async function handleToolAction(action, serverId, toolName) {
  const tool = state.tools.find((item) => item.serverId === serverId && item.upstreamName === toolName);
  if (!tool) return;
  try {
    if (action === 'edit') { toolDialog(tool); return; }
    await api(`/api/v1/servers/${encodeURIComponent(serverId)}/tools/${encodeURIComponent(toolName)}`, { method: 'PUT', body: JSON.stringify({ enabled: !tool.enabled, version: tool.version }) });
    await loadAll();
  } catch (error) { toast(error.message, true); }
}

$('#token-input').value = token();
$('#save-token').addEventListener('click', () => { localStorage.setItem('mcp-admin-token', $('#token-input').value.trim()); toast('管理令牌已保存在当前浏览器'); loadAll(); });
$('#refresh-all').addEventListener('click', () => loadAll(true));
$('#refresh-tools').addEventListener('click', async () => { try { await Promise.all(state.servers.filter((server) => server.enabled).map((server) => api(`/api/v1/servers/${encodeURIComponent(server.id)}/refresh`, { method: 'POST' }))); await loadAll(); toast('所有启用服务已刷新'); } catch (error) { toast(error.message, true); } });
$('#theme-toggle').addEventListener('click', () => { document.body.classList.toggle('light'); localStorage.setItem('mcp-theme', document.body.classList.contains('light') ? 'light' : 'dark'); });
if (localStorage.getItem('mcp-theme') !== 'dark') document.body.classList.add('light');

document.addEventListener('click', (event) => {
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
  if (tagAction && tagAction.dataset.tagAction === 'delete') deleteTag(tagAction.dataset.tagName);
  const close = event.target.closest('[data-close-dialog]');
  if (close) $(`#${close.dataset.closeDialog}`).close();
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
$('#tool-tag-filter').addEventListener('change', () => { state.toolPage = 1; loadAll(); });
$('#tool-server-filter').addEventListener('change', () => { state.toolPage = 1; loadAll(); });
document.addEventListener('change', (event) => {
  if (event.target?.id === 'tool-page-size') {
    state.toolPageSize = Number(event.target.value) || 20;
    state.toolPage = 1;
    loadAll();
  }
});
$('#server-filters').addEventListener('click', (event) => { const button = event.target.closest('[data-server-filter]'); if (!button) return; state.serverFilter = button.dataset.serverFilter; renderServers(); });

$('#server-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  try {
    const args = data.args ? JSON.parse(data.args) : [];
    const headers = data.headers ? JSON.parse(data.headers) : {};
    if (!Array.isArray(args) || typeof headers !== 'object' || Array.isArray(headers)) throw new Error('Args 必须是数组，Headers 必须是 JSON 对象');
    const payload = { id: data.id, name: data.name, type: data.type, enabled: data.enabled === 'true', command: data.command || undefined, args, cwd: data.cwd || undefined, url: data.url || undefined, headers };
    await api(state.editingServer ? `/api/v1/servers/${encodeURIComponent(state.editingServer.id)}` : '/api/v1/servers', { method: state.editingServer ? 'PUT' : 'POST', body: JSON.stringify({ ...payload, ...(state.editingServer ? { version: state.editingServer.version } : {}) }) });
    $('#server-dialog').close();
    toast(state.editingServer ? '服务配置已更新' : '服务已添加');
    state.editingServer = null;
    await loadAll();
  } catch (error) { toast(error.message === 'VERSION_CONFLICT' ? '服务配置已被其他操作更新，请刷新服务列表后重试' : error.message, true); }
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
    // Tag associations are independent from tool metadata. Do not submit a
    // stale metadata version when the user only changes tags.
    if (metadataChanged) {
      await api(`/api/v1/servers/${encodeURIComponent(tool.serverId)}/tools/${encodeURIComponent(tool.upstreamName)}`, { method: 'PUT', body: JSON.stringify({ displayName, descriptionOverride, timeoutMs, concurrencyLimit, version: tool.version }) });
    }
    await api(`/api/v1/servers/${encodeURIComponent(tool.serverId)}/tools/${encodeURIComponent(tool.upstreamName)}/tags`, { method: 'PUT', body: JSON.stringify({ tags }) });
    $('#tool-dialog').close();
    state.editingTool = null;
    toast('工具元数据已更新');
    await loadAll();
  } catch (error) { toast(error.message === 'VERSION_CONFLICT' ? '工具已被其他操作更新，请刷新工具目录后重试' : error.message, true); }
});

$('#tag-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  try { await api('/api/v1/tags', { method: 'POST', body: JSON.stringify(data) }); form.reset(); toast('标签已创建'); await loadAll(); } catch (error) { toast(error.message, true); }
});

async function deleteTag(name) {
  if (!confirm(`删除标签“${name}”？工具不会被删除，只会解除关联。`)) return;
  try { await api(`/api/v1/tags/${encodeURIComponent(name)}`, { method: 'DELETE' }); toast('标签已删除'); await loadAll(); } catch (error) { toast(error.message, true); }
}

loadAll();

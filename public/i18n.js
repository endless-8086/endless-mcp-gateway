(function () {
  const DICT = {
    zh: {
      brand_sub: 'MCP Gateway',
      nav_overview: '总览',
      nav_servers: '上游服务',
      nav_tools: '工具目录',
      nav_tags: '标签管理',
      connected: '控制面已连接',
      control_plane: 'CONTROL PLANE',
      page_overview: '网关总览',
      page_servers: '上游服务',
      page_tools: '工具目录',
      page_tags: '标签管理',
      token_label: '管理令牌',
      token_placeholder: 'ADMIN_TOKEN',
      token_save: '保存',
      token_show: '显示令牌',
      token_hide: '隐藏令牌',
      refresh_data: '刷新数据',
      hero_title: '让每一个工具，都能被安全地组合。',
      hero_sub: '统一接入 stdio、SSE 与 Streamable HTTP 上游，按服务和标签分发工具。',
      metric_servers: '上游服务',
      metric_tools: '可用工具',
      metric_tags: '标签',
      metric_loading: '加载中',
      metric_sub_servers: '{0} 个已配置',
      metric_sub_tools: '{0} 个已发现',
      metric_sub_tags: '工具分组',
      endpoint_overline: 'MCP CONNECTION',
      endpoint_title: '连接端点',
      endpoint_description: '将下列地址配置到支持 Streamable HTTP 的 MCP 客户端。',
      endpoint_auth_label: '鉴权',
      endpoint_all_label: '全部工具',
      endpoint_all_description: '聚合所有已启用的上游工具，适合主 Agent 使用。',
      endpoint_server_label: '指定服务',
      endpoint_server_description: '仅暴露一个上游服务的工具；将 {serverId} 替换为服务 ID。',
      endpoint_tag_label: '指定标签',
      endpoint_tag_description: '仅暴露关联标签的工具；将 {tag} 替换为标签名称。',
      runtime_heading: '运行中的上游',
      view_all: '查看全部 →',
      overview_empty_title: '还没有启用的上游服务',
      overview_empty_desc: '去「上游服务」添加第一个 MCP 服务。',
      servers_heading: '上游服务',
      servers_desc: '管理连接、刷新工具并控制服务是否出现在网关中。',
      add_server: '＋ 添加服务',
      search_servers: '搜索服务名称或 ID',
      filter_all: '全部',
      filter_ready: '运行中',
      filter_disabled: '已停用',
      table_server: '服务',
      table_type: '类型',
      table_status: '状态',
      table_last_connect: '最后连接',
      table_version: '版本',
      btn_edit: '编辑',
      btn_refresh: '刷新',
      btn_disable: '停用',
      btn_enable: '启用',
      btn_delete: '删除',
      status_disabled: '已停用',
      status_ready: '运行中',
      status_starting: '连接中',
      status_degraded: '降级',
      status_failed: '失败',
      status_stopping: '停止中',
      status_stopped: '已停止',
      status_unknown: '未知',
      status_orphaned: '已下线',
      status_enabled: '已启用',
      never_connected: '尚未连接',
      last_connected: '最后连接 {0}',
      normal_status: '连接状态正常',
      servers_empty_title: '没有匹配的上游服务',
      servers_empty_desc: '调整筛选条件或添加一个新服务。',
      tools_heading: '工具目录',
      tools_desc: '查看所有上游工具，编辑描述、并发和标签。',
      refresh_tools: '↻ 刷新工具',
      search_tools: '搜索工具名称、描述或服务',
      filter_all_tags: '所有标签',
      filter_all_servers: '所有服务',
      table_tool: '工具',
      table_tags: '标签',
      table_params: '参数',
      no_category: '未分类',
      no_params: '无参数',
      params_schema: 'JSON Schema',
      tools_empty_title: '没有匹配的工具',
      tools_empty_desc: '刷新上游服务，或调整搜索和标签筛选。',
      page_size: '每页 {0}',
      pagination_prev: '上一页',
      pagination_next: '下一页',
      pagination_page: '第 {0} / {1} 页',
      pagination_range: '显示 {0}–{1} / 共 {2} 个工具',
      server_id: '服务 ID',
      server_name: '名称',
      server_type: '类型',
      server_enabled: '启用',
      server_timeout_ms: '服务超时（毫秒）',
      server_timeout_placeholder: '1800000',
      server_timeout_hint: '留空使用 Gateway 默认值；工具单独设置超时时优先使用工具值。',
      server_timeout_invalid: '服务超时必须在 100 到 3600000 毫秒之间。',
      server_command: 'Command',
      server_args: 'Args（JSON 数组）',
      server_cwd: '工作目录',
      server_url: 'URL',
      server_headers: 'Headers（JSON 对象）',
      dialog_cancel: '取消',
      dialog_save_server: '保存服务',
      dialog_edit_server: '编辑 {0}',
      dialog_add_server: '添加上游服务',
      dialog_delete_confirm: '确定删除「{0}」吗？',
      toast_server_added: '服务已添加',
      toast_server_updated: '服务配置已更新',
      toast_server_deleted: '服务已删除',
      toast_tools_refreshed: '工具目录刷新完成',
      toast_all_refreshed: '所有启用服务已刷新',
      toast_data_refreshed: '数据已刷新',
      toast_token_saved: '管理令牌已保存在当前浏览器',
      toast_tool_updated: '工具元数据已更新',
      toast_tag_created: '标签已创建',
      toast_tag_updated: '标签已更新',
      toast_tag_deleted: '标签已删除',
      toast_load_failed: '无法加载控制面数据',
      toast_version_conflict_server: '服务配置已被其他操作更新，请刷新服务列表后重试',
      toast_version_conflict_tool: '工具已被其他操作更新，请刷新工具目录后重试',
      dialog_tool_title: '编辑工具',
      dialog_tool_name: '展示名称',
      dialog_tool_name_placeholder: '可选的中文名称',
      dialog_tool_timeout: '调用超时（ms）',
      dialog_tool_desc_override: '描述覆盖',
      dialog_tool_desc_placeholder: '留空则使用上游描述',
      dialog_tool_concurrency: '单工具并发上限',
      dialog_tool_concurrency_placeholder: '使用服务默认值',
      dialog_tool_tags: 'TAGS',
      dialog_save_tool: '保存工具',
      dialog_edit_tag: '编辑标签「{0}」',
      dialog_save_tag: '保存标签',
      dialog_form_hint: '敏感 Header 建议使用环境变量或 Secret Manager，不要直接保存在浏览器。',
      dialog_edit_tool_subtitle: '{0}',
      tags_heading: '标签管理',
      tags_desc: '用标签创建面向不同场景的 MCP 工具集合。',
      tags_new_heading: '创建标签',
      tags_name: '标签名称',
      tags_name_placeholder: '例如 database',
      tags_display_name: '展示名称',
      tags_display_name_placeholder: '例如 数据库',
      tags_description: '描述',
      tags_description_placeholder: '这个标签用于什么场景？',
      tags_create_btn: '创建标签',
      tags_no_desc: '暂无描述',
      tags_count: '{0} 个工具',
      tags_summary: '{0} 个标签 · {1} 个已分类工具',
      tags_empty_title: '还没有标签',
      tags_empty_desc: '创建标签后，可以在工具编辑器中分配。',
      tags_delete_confirm: '删除标签「{0}」？工具不会被删除，只会解除关联。',
      tags_create_first: '先创建标签',
      api_error: '请求失败（{0}）',
      enabled: '启用',
      disabled: '停用',
      lang_switch_label: '语言',
      upstream_config: 'UPSTREAM CONFIG',
      tool_metadata: 'TOOL METADATA',
      tool_catalog: 'TOOL CATALOG',
      taxonomy: 'TAXONOMY',
      new_tag: 'NEW TAG',
      runtime: 'RUNTIME',
      upstreams: 'UPSTREAMS'
    },
    en: {
      brand_sub: 'MCP Gateway',
      nav_overview: 'Overview',
      nav_servers: 'Servers',
      nav_tools: 'Tools',
      nav_tags: 'Tags',
      connected: 'Control plane connected',
      control_plane: 'CONTROL PLANE',
      page_overview: 'Gateway Overview',
      page_servers: 'Upstream Servers',
      page_tools: 'Tool Catalog',
      page_tags: 'Tag Manager',
      token_label: 'Admin Token',
      token_placeholder: 'ADMIN_TOKEN',
      token_save: 'Save',
      token_show: 'Show token',
      token_hide: 'Hide token',
      refresh_data: 'Refresh',
      hero_title: 'Compose every tool, securely.',
      hero_sub: 'Aggregate stdio, SSE and Streamable HTTP upstreams. Route tools by server and tag.',
      metric_servers: 'Servers',
      metric_tools: 'Tools',
      metric_tags: 'Tags',
      metric_loading: 'Loading…',
      metric_sub_servers: '{0} configured',
      metric_sub_tools: '{0} discovered',
      metric_sub_tags: 'Tool groups',
      endpoint_overline: 'MCP CONNECTION',
      endpoint_title: 'Connection Endpoints',
      endpoint_description: 'Configure one of these URLs in an MCP client that supports Streamable HTTP.',
      endpoint_auth_label: 'Authentication',
      endpoint_all_label: 'All Tools',
      endpoint_all_description: 'Aggregates every enabled upstream tool. Use this endpoint for the primary agent.',
      endpoint_server_label: 'One Server',
      endpoint_server_description: 'Exposes one upstream server only. Replace {serverId} with the server ID.',
      endpoint_tag_label: 'One Tag',
      endpoint_tag_description: 'Exposes tools assigned to one tag. Replace {tag} with the tag name.',
      runtime_heading: 'Active Upstreams',
      view_all: 'View all →',
      overview_empty_title: 'No active upstreams',
      overview_empty_desc: 'Add your first MCP server in Servers.',
      servers_heading: 'Upstream Servers',
      servers_desc: 'Manage connections, refresh tools, and control server visibility in the gateway.',
      add_server: '+ Add Server',
      search_servers: 'Search server name or ID',
      filter_all: 'All',
      filter_ready: 'Ready',
      filter_disabled: 'Disabled',
      table_server: 'Server',
      table_type: 'Type',
      table_status: 'Status',
      table_last_connect: 'Last Connected',
      table_version: 'Version',
      btn_edit: 'Edit',
      btn_refresh: 'Refresh',
      btn_disable: 'Disable',
      btn_enable: 'Enable',
      btn_delete: 'Delete',
      status_disabled: 'Disabled',
      status_ready: 'Ready',
      status_starting: 'Starting',
      status_degraded: 'Degraded',
      status_failed: 'Failed',
      status_stopping: 'Stopping',
      status_stopped: 'Stopped',
      status_unknown: 'Unknown',
      status_orphaned: 'Orphaned',
      status_enabled: 'Enabled',
      never_connected: 'Never',
      last_connected: 'Last connected {0}',
      normal_status: 'Healthy',
      servers_empty_title: 'No matching servers',
      servers_empty_desc: 'Adjust filters or add a new server.',
      tools_heading: 'Tool Catalog',
      tools_desc: 'Browse all upstream tools. Edit descriptions, concurrency, and tags.',
      refresh_tools: '↻ Refresh Tools',
      search_tools: 'Search tool name, description or server',
      filter_all_tags: 'All Tags',
      filter_all_servers: 'All Servers',
      table_tool: 'Tool',
      table_tags: 'Tags',
      table_params: 'Params',
      no_category: 'Uncategorized',
      no_params: 'None',
      params_schema: 'JSON Schema',
      tools_empty_title: 'No matching tools',
      tools_empty_desc: 'Refresh upstream servers or adjust search and tag filters.',
      page_size: '{0} per page',
      pagination_prev: 'Previous',
      pagination_next: 'Next',
      pagination_page: 'Page {0} / {1}',
      pagination_range: 'Showing {0}–{1} of {2} tools',
      server_id: 'Server ID',
      server_name: 'Name',
      server_type: 'Type',
      server_enabled: 'Enabled',
      server_timeout_ms: 'Service Timeout (ms)',
      server_timeout_placeholder: '1800000',
      server_timeout_hint: 'Leave empty to use the Gateway default. A per-tool timeout overrides this value.',
      server_timeout_invalid: 'Service timeout must be between 100 and 3600000 milliseconds.',
      server_command: 'Command',
      server_args: 'Args (JSON array)',
      server_cwd: 'Working Directory',
      server_url: 'URL',
      server_headers: 'Headers (JSON object)',
      dialog_cancel: 'Cancel',
      dialog_save_server: 'Save Server',
      dialog_edit_server: 'Edit {0}',
      dialog_add_server: 'Add Upstream Server',
      dialog_delete_confirm: 'Delete "{0}"?',
      toast_server_added: 'Server added',
      toast_server_updated: 'Server updated',
      toast_server_deleted: 'Server deleted',
      toast_tools_refreshed: 'Tool refresh completed',
      toast_all_refreshed: 'All active servers refreshed',
      toast_data_refreshed: 'Data refreshed',
      toast_token_saved: 'Admin token saved to browser',
      toast_tool_updated: 'Tool metadata updated',
      toast_tag_created: 'Tag created',
      toast_tag_updated: 'Tag updated',
      toast_tag_deleted: 'Tag deleted',
      toast_load_failed: 'Failed to load control plane data',
      toast_version_conflict_server: 'Server config was updated elsewhere. Refresh the server list and try again.',
      toast_version_conflict_tool: 'Tool was updated elsewhere. Refresh the tool catalog and try again.',
      dialog_tool_title: 'Edit Tool',
      dialog_tool_name: 'Display Name',
      dialog_tool_name_placeholder: 'e.g. Read File',
      dialog_tool_timeout: 'Call Timeout (ms)',
      dialog_tool_desc_override: 'Description Override',
      dialog_tool_desc_placeholder: 'Leave blank to use upstream description',
      dialog_tool_concurrency: 'Per-Tool Concurrency Limit',
      dialog_tool_concurrency_placeholder: 'Use server default',
      dialog_tool_tags: 'TAGS',
      dialog_save_tool: 'Save Tool',
      dialog_edit_tag: 'Edit tag "{0}"',
      dialog_save_tag: 'Save Tag',
      dialog_form_hint: 'Store sensitive headers in environment variables or a Secret Manager, not the browser.',
      dialog_edit_tool_subtitle: '{0}',
      tags_heading: 'Tag Manager',
      tags_desc: 'Create scenario-specific MCP tool collections with tags.',
      tags_new_heading: 'Create Tag',
      tags_name: 'Tag Name',
      tags_name_placeholder: 'e.g. database',
      tags_display_name: 'Display Name',
      tags_display_name_placeholder: 'e.g. Database',
      tags_description: 'Description',
      tags_description_placeholder: 'What scenario is this tag for?',
      tags_create_btn: 'Create Tag',
      tags_no_desc: 'No description',
      tags_count: '{0} tools',
      tags_summary: '{0} tags · {1} categorized tools',
      tags_empty_title: 'No tags yet',
      tags_empty_desc: 'Create tags and assign them in the tool editor.',
      tags_delete_confirm: 'Delete tag "{0}"? Tools will not be deleted, only unlinked.',
      tags_create_first: 'Create a tag first',
      api_error: 'Request failed ({0})',
      enabled: 'Enabled',
      disabled: 'Disabled',
      lang_switch_label: 'Language',
      upstream_config: 'UPSTREAM CONFIG',
      tool_metadata: 'TOOL METADATA',
      tool_catalog: 'TOOL CATALOG',
      taxonomy: 'TAXONOMY',
      new_tag: 'NEW TAG',
      runtime: 'RUNTIME',
      upstreams: 'UPSTREAMS'
    }
  };

  const STORAGE_KEY = 'mcp-lang';

  let currentLang = localStorage.getItem(STORAGE_KEY);
  if (!currentLang) {
    currentLang = (navigator.language || 'en').startsWith('zh') ? 'zh' : 'en';
    localStorage.setItem(STORAGE_KEY, currentLang);
  }

  function t(key, substitutions) {
    const dict = DICT[currentLang] || DICT.en;
    let text = dict[key];
    if (text === undefined) {
      console.warn('[i18n] Missing key:', key);
      return key;
    }
    if (substitutions) {
      Object.keys(substitutions).forEach(function (k) {
        text = text.replace('{' + k + '}', substitutions[k]);
      });
    }
    return text;
  }

  function setLanguage(lang) {
    if (!DICT[lang]) return;
    currentLang = lang;
    localStorage.setItem(STORAGE_KEY, lang);
    applyToDOM();
    // Dispatch so app.js can re-render
    window.dispatchEvent(new CustomEvent('i18n-changed', { detail: { lang: lang } }));
  }

  function applyToDOM() {
    var elements = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      var key = el.getAttribute('data-i18n');
      if (!key) continue;
      var mode = el.getAttribute('data-i18n-mode') || 'text';
      var value = t(key);
      if (mode === 'placeholder') {
        el.setAttribute('placeholder', value);
      } else if (mode === 'title') {
        el.setAttribute('title', value);
      } else if (mode === 'aria') {
        el.setAttribute('aria-label', value);
      } else {
        el.textContent = value;
      }
    }
    // Update document lang
    document.documentElement.lang = currentLang === 'zh' ? 'zh-CN' : 'en';
  }

  window.i18n = { t: t, setLanguage: setLanguage, applyToDOM: applyToDOM, lang: currentLang };
  window.__ = t;

  // DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { applyToDOM(); initSwitcher(); });
  } else {
    applyToDOM();
    initSwitcher();
  }
  function initSwitcher() {
    var trigger = document.getElementById('lang-switch');
    var label = document.getElementById('lang-switch-label');
    var menu = document.getElementById('lang-menu');
    if (!trigger || !label || !menu) return;

    function closeMenu() {
      menu.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    }

    function updateLabel() {
      label.textContent = currentLang === 'zh' ? '中文' : 'English';
      var options = menu.querySelectorAll('[data-lang-option]');
      for (var i = 0; i < options.length; i++) {
        options[i].setAttribute('aria-selected', String(options[i].dataset.langOption === currentLang));
      }
    }

    updateLabel();
    trigger.addEventListener('click', function() {
      var nextOpen = menu.hidden;
      menu.hidden = !nextOpen;
      trigger.setAttribute('aria-expanded', String(nextOpen));
    });
    menu.addEventListener('click', function(event) {
      var option = event.target.closest('[data-lang-option]');
      if (!option) return;
      setLanguage(option.dataset.langOption);
      updateLabel();
      closeMenu();
    });
    document.addEventListener('click', function(event) {
      if (!event.target.closest('.language-picker')) closeMenu();
    });
    document.addEventListener('keydown', function(event) {
      if (event.key === 'Escape') closeMenu();
    });
  }

})();

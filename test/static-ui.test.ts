import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

test('admin UI assets include the management views and safe conditional fields', async () => {
  const [html, css, script] = await Promise.all([
    fs.readFile('public/index.html', 'utf8'),
    fs.readFile('public/styles.css', 'utf8'),
    fs.readFile('public/app.js', 'utf8')
  ]);
  for (const view of ['view-overview', 'view-servers', 'view-tools', 'view-tags']) assert.match(html, new RegExp(`id="${view}"`));
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  assert.equal((html.match(/class="close-button" data-close-dialog=/g) || []).length, 3);
  assert.match(script, /\/api\/v1\/servers/);
  assert.match(script, /\/api\/v1\/tags/);
  assert.match(script, /paginate: 'true'/);
  assert.match(script, /data-tool-page/);
  assert.match(script, /filterSelectMarkup/);
  assert.match(script, /data-filter-select-trigger/);
  assert.match(script, /closeFilterSelects/);
  assert.doesNotMatch(script, /enabled: !tool\.enabled, version: tool\.version/);
  assert.match(html, /class="filter-select-slot"/);
  assert.doesNotMatch(html, /id="tool-tag-filter"[^>]*<select/);
  assert.doesNotMatch(css, /::-webkit-scrollbar/);
  assert.match(html, /data-endpoint-path="\/mcp"/);
  assert.match(html, /data-endpoint-path="\/mcp\/servers\/\{serverId\}"/);
  assert.match(html, /data-endpoint-path="\/mcp\/tags\/\{tag\}"/);
  assert.match(script, /renderEndpointUrls/);
  assert.match(html, /class="language-picker"/);
  assert.match(html, /data-lang-option="zh"/);
  assert.match(html, /data-lang-option="en"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /name="timeoutMs" type="number"/);
  assert.match(html, /<label><span data-i18n="dialog_tool_name">/);
  assert.match(html, /<label class="full"><span data-i18n="dialog_tool_desc_override">/);
  assert.doesNotMatch(html, /<label[^>]+data-i18n="dialog_tool_name"/);
  assert.match(html, /id="tag-edit-dialog"/);
  assert.match(html, /id="tag-edit-name"/);
  assert.match(script, /function tagDialog/);
  assert.match(script, /data-tag-action="edit"/);
  assert.match(script, /server_timeout_invalid/);
  assert.match(html, /id="toggle-token-visibility"/);
  assert.match(script, /setTokenVisibility/);
  assert.equal((html.match(/class="nav-icon"/g) || []).length, 4);
  assert.doesNotMatch(html, /class="brand-symbol"/);
  assert.doesNotMatch(html, /theme-toggle/);
  assert.doesNotMatch(script, /mcp-theme/);
  assert.doesNotMatch(css, /color-scheme:\s*dark/);
  assert.doesNotMatch(script, /event\.currentTarget\.reset\(\)/);
  assert.match(script, /const form = event\.currentTarget/);
});

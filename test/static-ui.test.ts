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
  assert.equal((html.match(/class="close-button" data-close-dialog=/g) || []).length, 2);
  assert.match(script, /\/api\/v1\/servers/);
  assert.match(script, /\/api\/v1\/tags/);
  assert.match(script, /paginate: 'true'/);
  assert.match(script, /data-tool-page/);
  assert.doesNotMatch(script, /event\.currentTarget\.reset\(\)/);
  assert.match(script, /const form = event\.currentTarget/);
});

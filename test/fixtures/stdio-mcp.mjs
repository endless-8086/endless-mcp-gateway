import readline from 'node:readline';

const tools = [{
  name: 'echo',
  description: 'Echo input',
  inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] }
}];

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  if (message.method === 'initialize') {
    respond(message.id, { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1.0.0' } });
  } else if (message.method === 'tools/list') {
    respond(message.id, { tools });
  } else if (message.method === 'tools/call') {
    respond(message.id, { content: [{ type: 'text', text: String(message.params?.arguments?.text ?? '') }] });
  } else if (message.id !== undefined) {
    respond(message.id, {});
  }
});

function respond(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

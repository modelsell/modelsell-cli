import { createInterface } from 'node:readline';
import WebSocket from 'ws';

export async function consumeSSE(response, { json, write }) {
  let buffer = '', terminal = false;
  const decoder = new TextDecoder();
  const event = block => {
    const lines = block.split('\n');
    const data = lines.filter(l => l.startsWith('data:')).map(l => l.slice(5).replace(/^ /, '')).join('\n');
    if (!data) return;
    if (data === '[DONE]') { terminal = true; return; }
    let value;
    try { value = JSON.parse(data); } catch { throw new Error('Invalid JSON in server stream.'); }
    if (value.error || value.type === 'error' || ['response.failed', 'response.incomplete'].includes(value.type)) throw new Error(value.error?.message || value.response?.error?.message || 'Generation stream failed or incomplete.');
    if (['message_stop', 'response.completed'].includes(value.type) || value.choices?.some(c => c.finish_reason) || value.candidates?.some(c => c.finishReason)) terminal = true;
    if (json) write(JSON.stringify(value) + '\n');
    else {
      const text = value.choices?.map(c => c.delta?.content || c.text || '').join('') || (value.type === 'response.output_text.delta' ? value.delta : '') || value.delta?.text || value.candidates?.flatMap(c => c.content?.parts || []).map(p => p.text || '').join('') || '';
      if (text) write(text);
    }
  };
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    buffer = buffer.replace(/\r\n/g, '\n');
    if (buffer.length > 16 * 1024 * 1024) throw new Error('Stream event exceeds 16 MiB.');
    let end;
    while ((end = buffer.indexOf('\n\n')) >= 0) { event(buffer.slice(0, end)); buffer = buffer.slice(end + 2); }
  }
  buffer += decoder.decode();
  if (buffer.trim()) event(buffer);
  if (!terminal) throw new Error('Stream ended without a completion event; the response may be incomplete.');
  if (!json) write('\n');
}

// JSONL bridge: audio buffers, tools and session configuration remain native events.
export async function realtime(client, model, { stdin, write, signal, headers = {} }) {
  if (!client.apiKey) throw new Error('Set MODELSELL_API_KEY or run modelsell login.');
  const url = new URL(client.baseUrl + '/v1/realtime');
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('model', model);
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers: { ...headers, Authorization: `Bearer ${client.apiKey}`, 'OpenAI-Beta': 'realtime=v1' }, followRedirects: false, handshakeTimeout: client.timeout });
    let lines, failure;
    const abort = () => { failure = new Error('Realtime session cancelled.'); ws.terminate(); };
    const timer = setTimeout(() => { failure = new Error('Realtime session timeout.'); ws.terminate(); }, client.timeout);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    ws.on('open', () => {
      lines = createInterface({ input: stdin, crlfDelay: Infinity });
      lines.on('line', line => {
        if (!line.trim()) return;
        try {
          const parsed = JSON.parse(line);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Realtime input must be one JSON object per line.');
          if (ws.bufferedAmount > 16 * 1024 * 1024) throw new Error('Realtime send buffer is full; slow down the input.');
          ws.send(JSON.stringify(parsed));
        } catch (error) { failure = error; ws.close(); }
      });
      // EOF only ends input. Keep receiving model events until close or timeout.
    });
    ws.on('message', bytes => {
      try {
        const event = JSON.parse(bytes.toString());
        write(JSON.stringify(event) + '\n');
        if (event.type === 'error') { failure = new Error(event.error?.message || 'Realtime API error.'); ws.close(); }
      } catch (error) { failure = error; ws.close(); }
    });
    ws.on('error', error => { failure = error; });
    ws.on('close', (code) => {
      clearTimeout(timer); lines?.close(); signal?.removeEventListener('abort', abort);
      if (failure) reject(failure);
      else if (![1000, 1005].includes(code)) reject(new Error(`Realtime socket closed with code ${code}.`));
      else resolve();
    });
  });
}

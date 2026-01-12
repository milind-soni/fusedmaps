/**
 * AI Panel - Natural language to DuckDB SQL generation
 */

export interface AiConfig {
  enabled: boolean;
  apiKey?: string;
  model?: string;
  schema?: {
    tables: Record<string, {
      name: string;
      columns: Array<{ name: string; type: string; description?: string }>;
      sql?: string;
    }>;
    description?: string;
  };
  systemPrompt?: string;
}

export interface AiPanelDeps {
  aiSection: HTMLElement;
  aiChatEl: HTMLElement;
  aiInputEl: HTMLTextAreaElement;
  aiSendBtn: HTMLButtonElement;
  aiStatusEl: HTMLElement;
  aiSqlPreviewEl: HTMLElement;
  getActiveLayerId: () => string | null;
  onSqlGenerated: (layerId: string, sql: string) => void;
}

export interface AiPanel {
  setConfig: (config: AiConfig) => void;
  destroy: () => void;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  sql?: string;
}

const DEFAULT_MODEL = 'openai/gpt-4o-mini';

function buildSystemPrompt(config: AiConfig): string {
  const schema = config.schema;
  let schemaDesc = '';

  if (schema?.tables) {
    const tableDescs = Object.entries(schema.tables).map(([id, table]) => {
      const cols = table.columns.map(c => {
        let desc = `  - ${c.name} (${c.type})`;
        if (c.description) desc += `: ${c.description}`;
        return desc;
      }).join('\n');
      return `Table: data (alias for layer "${table.name}")\nColumns:\n${cols}`;
    });
    schemaDesc = tableDescs.join('\n\n');
  }

  const customPrompt = config.systemPrompt || '';

  return `You are a DuckDB SQL query assistant for a geospatial map application.

Your job is to convert natural language questions into valid DuckDB SQL queries.

${schema?.description || ''}

Available Schema:
${schemaDesc || 'No schema information available.'}

Rules:
1. Always use "data" as the table name
2. Output ONLY the SQL query, nothing else
3. Use standard SQL syntax compatible with DuckDB
4. For filtering, use WHERE clauses
5. For aggregations, use GROUP BY with appropriate columns
6. The "hex" column contains H3 hexagon IDs - always include it in SELECT
7. Keep queries simple and focused on filtering/aggregating the data

${customPrompt}

Examples:
User: "Show me areas with more than 50% coverage"
SQL: SELECT * FROM data WHERE pct > 50

User: "Filter to crop type 1"
SQL: SELECT * FROM data WHERE data = 1

User: "Show top 10 hexes by area"
SQL: SELECT * FROM data ORDER BY area DESC LIMIT 10`;
}

async function callOpenRouter(
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 500,
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

function extractSqlFromResponse(response: string): string {
  // Try to extract SQL from markdown code blocks
  const codeBlockMatch = response.match(/```(?:sql)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Try to find SELECT statement
  const selectMatch = response.match(/(SELECT[\s\S]*?(?:;|$))/i);
  if (selectMatch) {
    return selectMatch[1].trim().replace(/;$/, '');
  }

  // Return as-is if it looks like SQL
  const trimmed = response.trim();
  if (trimmed.toUpperCase().startsWith('SELECT')) {
    return trimmed.replace(/;$/, '');
  }

  return trimmed;
}

function validateSql(sql: string): { valid: boolean; error?: string } {
  const upper = sql.toUpperCase();

  // Block dangerous operations
  const dangerous = ['DROP', 'DELETE', 'INSERT', 'UPDATE', 'ALTER', 'CREATE TABLE', 'TRUNCATE'];
  for (const keyword of dangerous) {
    if (upper.includes(keyword)) {
      return { valid: false, error: `Dangerous operation not allowed: ${keyword}` };
    }
  }

  // Must be a SELECT query
  if (!upper.trim().startsWith('SELECT')) {
    return { valid: false, error: 'Query must start with SELECT' };
  }

  return { valid: true };
}

export function createAiPanel(deps: AiPanelDeps): AiPanel {
  const {
    aiSection,
    aiChatEl,
    aiInputEl,
    aiSendBtn,
    aiStatusEl,
    aiSqlPreviewEl,
    getActiveLayerId,
    onSqlGenerated,
  } = deps;

  let config: AiConfig = { enabled: false };
  let chatHistory: ChatMessage[] = [];
  let isLoading = false;

  const setStatus = (text: string, isError = false) => {
    try {
      aiStatusEl.textContent = text;
      aiStatusEl.style.color = isError ? '#ff6b6b' : '#888';
    } catch (_) {}
  };

  const renderChat = () => {
    try {
      aiChatEl.innerHTML = chatHistory
        .filter(m => m.role !== 'system')
        .map(m => {
          const isUser = m.role === 'user';
          return `
            <div class="ai-message ${isUser ? 'user' : 'assistant'}">
              <div class="ai-message-content">${escapeHtml(m.content)}</div>
              ${m.sql ? `<div class="ai-message-sql"><code>${escapeHtml(m.sql)}</code></div>` : ''}
            </div>
          `;
        }).join('');
      aiChatEl.scrollTop = aiChatEl.scrollHeight;
    } catch (_) {}
  };

  const escapeHtml = (text: string): string => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };

  const showSqlPreview = (sql: string) => {
    try {
      aiSqlPreviewEl.innerHTML = `
        <div class="ai-sql-preview">
          <div class="ai-sql-label">Generated SQL:</div>
          <code>${escapeHtml(sql)}</code>
          <div class="ai-sql-actions">
            <button class="ai-apply-btn" title="Apply this query">Apply</button>
            <button class="ai-copy-btn" title="Copy SQL">Copy</button>
          </div>
        </div>
      `;
      aiSqlPreviewEl.style.display = 'block';

      // Wire up buttons
      const applyBtn = aiSqlPreviewEl.querySelector('.ai-apply-btn');
      const copyBtn = aiSqlPreviewEl.querySelector('.ai-copy-btn');

      applyBtn?.addEventListener('click', () => {
        const layerId = getActiveLayerId();
        if (layerId) {
          onSqlGenerated(layerId, sql);
          setStatus('Query applied!');
        } else {
          setStatus('No active layer', true);
        }
      });

      copyBtn?.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(sql);
          setStatus('Copied!');
        } catch (_) {
          setStatus('Copy failed', true);
        }
      });
    } catch (_) {}
  };

  const hideSqlPreview = () => {
    try {
      aiSqlPreviewEl.style.display = 'none';
      aiSqlPreviewEl.innerHTML = '';
    } catch (_) {}
  };

  const sendMessage = async () => {
    if (isLoading) return;

    const userInput = aiInputEl.value.trim();
    if (!userInput) return;

    if (!config.apiKey) {
      setStatus('No API key configured', true);
      return;
    }

    const layerId = getActiveLayerId();
    if (!layerId) {
      setStatus('Select a DuckDB layer first', true);
      return;
    }

    // Add user message
    chatHistory.push({ role: 'user', content: userInput });
    aiInputEl.value = '';
    renderChat();
    hideSqlPreview();

    isLoading = true;
    setStatus('Thinking...');
    aiSendBtn.disabled = true;

    try {
      // Build messages for API
      const systemPrompt = buildSystemPrompt(config);
      const apiMessages = [
        { role: 'system', content: systemPrompt },
        ...chatHistory.map(m => ({ role: m.role, content: m.content })),
      ];

      const response = await callOpenRouter(
        config.apiKey,
        config.model || DEFAULT_MODEL,
        apiMessages
      );

      const sql = extractSqlFromResponse(response);
      const validation = validateSql(sql);

      if (!validation.valid) {
        chatHistory.push({
          role: 'assistant',
          content: `I generated a query but it was blocked: ${validation.error}`,
        });
        setStatus(validation.error || 'Invalid query', true);
      } else {
        chatHistory.push({
          role: 'assistant',
          content: 'Here\'s the SQL query:',
          sql,
        });
        showSqlPreview(sql);
        setStatus('');
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Unknown error';
      chatHistory.push({
        role: 'assistant',
        content: `Sorry, there was an error: ${errMsg}`,
      });
      setStatus(errMsg, true);
    } finally {
      isLoading = false;
      aiSendBtn.disabled = false;
      renderChat();
    }
  };

  // Event listeners
  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const onSendClick = () => sendMessage();

  try {
    aiInputEl.addEventListener('keydown', onKeydown);
    aiSendBtn.addEventListener('click', onSendClick);
  } catch (_) {}

  // Initial state
  renderChat();
  setStatus(config.enabled ? '' : 'AI not configured');

  return {
    setConfig: (newConfig: AiConfig) => {
      config = newConfig;
      if (!config.enabled || !config.apiKey) {
        setStatus('AI not configured - add ai_config to deckgl_layers()');
        aiInputEl.disabled = true;
        aiSendBtn.disabled = true;
      } else {
        setStatus('');
        aiInputEl.disabled = false;
        aiSendBtn.disabled = false;
        aiInputEl.placeholder = 'Ask: "Show hexes where pct > 50"';
      }
    },
    destroy: () => {
      try { aiInputEl.removeEventListener('keydown', onKeydown); } catch (_) {}
      try { aiSendBtn.removeEventListener('click', onSendClick); } catch (_) {}
    },
  };
}

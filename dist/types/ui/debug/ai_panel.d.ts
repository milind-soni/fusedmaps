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
            columns: Array<{
                name: string;
                type: string;
                description?: string;
            }>;
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
export declare function createAiPanel(deps: AiPanelDeps): AiPanel;

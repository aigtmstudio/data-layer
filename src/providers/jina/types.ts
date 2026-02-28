// ── Jina Reader API types ──

export interface JinaReadResponse {
  code: number;
  status: number;
  data: {
    title: string;
    description: string;
    url: string;
    content: string;
    usage?: {
      tokens: number;
    };
  };
}

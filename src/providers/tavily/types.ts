export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  raw_content?: string;
  favicon?: string;
  /** Published date of the article (returned by Tavily for topic='news') */
  published_date?: string;
}

export interface TavilySearchResponse {
  query: string;
  answer?: string;
  images?: string[];
  results: TavilySearchResult[];
  response_time: number;
  usage?: { credits: number };
  request_id: string;
}

export interface TavilyExtractResult {
  url: string;
  raw_content: string;
  images?: string[];
  favicon?: string;
}

export interface TavilyExtractResponse {
  results: TavilyExtractResult[];
  failed_results: string[];
  response_time: number;
  usage?: { credits: number };
  request_id: string;
}

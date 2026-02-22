export interface ExaSearchResult {
  id: string;
  url: string;
  title?: string;
  author?: string;
  publishedDate?: string;
  text?: string;
  highlights?: string[];
  highlightScores?: number[];
  score?: number;
}

export interface ExaSearchResponse {
  requestId: string;
  autopromptString?: string;
  results: ExaSearchResult[];
}

export interface ExaContentsResponse {
  requestId: string;
  results: ExaSearchResult[];
}

export interface ExaSearchRequest {
  query: string;
  numResults?: number;
  type?: 'neural' | 'keyword' | 'auto';
  category?: 'company' | 'research paper' | 'news' | 'tweet' | 'github' | 'personal site';
  includeDomains?: string[];
  excludeDomains?: string[];
  startPublishedDate?: string;
  endPublishedDate?: string;
  contents?: {
    text?: { maxCharacters?: number; includeHtmlTags?: boolean };
    highlights?: { numSentences?: number; highlightsPerUrl?: number; query?: string };
  };
}

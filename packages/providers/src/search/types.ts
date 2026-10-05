export interface SearchDocument {
  id: string;
  websiteId: string;
  locale?: string;
  type: 'page' | 'collection-item' | 'post' | 'product';
  title: string;
  url: string;
  body: string;
  tags?: string[];
}

export interface SearchHit {
  id: string;
  title: string;
  url: string;
  snippet: string;
  score: number;
}

export interface SearchProvider {
  readonly driver: string;
  index(docs: SearchDocument[]): Promise<void>;
  remove(websiteId: string, ids?: string[]): Promise<void>;
  search(websiteId: string, query: string, opts?: { limit?: number; locale?: string }): Promise<SearchHit[]>;
}

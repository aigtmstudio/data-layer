'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Play, ChevronDown, ChevronRight, MapPin, Star, Newspaper, Store, MessageSquare, Search, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import * as api from '@/lib/api/discovery-test';
import type { TestResult } from '@/lib/api/discovery-test';

// ── Collapsible JSON viewer ────────────────────────────────────────────────

function JsonViewer({ label, data }: { label: string; data: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border rounded-md">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent/50"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {label}
      </button>
      {open && (
        <pre className="px-3 pb-3 text-xs overflow-auto max-h-96 whitespace-pre-wrap">
          {typeof data === 'string' ? data : JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ── Stats bar ──────────────────────────────────────────────────────────────

function StatsBar({ stats, durationMs }: { stats: Record<string, number>; durationMs: number }) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      {Object.entries(stats).map(([key, val]) => (
        <Badge key={key} variant="secondary" className="text-xs">
          {key.replace(/([A-Z])/g, ' $1').toLowerCase()}: {val}
        </Badge>
      ))}
      <Badge variant="outline" className="text-xs">{(durationMs / 1000).toFixed(1)}s</Badge>
    </div>
  );
}

// ── Result sections — renders method-specific viewers ───────────────────────

const SECTION_KEYS = [
  'rawPlaces', 'mappedCompanies', 'reviewSummary', 'llmPrompt', 'llmResponse',
  'matchedBusinesses', 'articles', 'extractedCompanies', 'rawResults', 'posts',
  'results', 'query', 'domains', 'platform', 'keywords', 'category',
] as const;

function ResultSections({ result }: { result: TestResult }) {
  return (
    <>
      {SECTION_KEYS.map((key) => {
        const val = result[key];
        if (val == null) return null;
        const isArray = Array.isArray(val);
        const label = isArray
          ? `${key} (${val.length})`
          : key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
        return <JsonViewer key={key} label={label} data={val} />;
      })}
    </>
  );
}

// ── Generic test card wrapper ──────────────────────────────────────────────

function TestCard({
  title,
  description,
  icon: Icon,
  children,
  result,
  error,
  loading,
  onRun,
}: {
  title: string;
  description: string;
  icon: typeof MapPin;
  children: React.ReactNode;
  result: TestResult | null;
  error: string | null;
  loading: boolean;
  onRun: () => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
          <Button size="sm" onClick={onRun} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Play className="mr-2 h-3 w-3" />}
            Run Test
          </Button>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {children}
        </div>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-3 pt-2 border-t">
            <StatsBar stats={result.stats} durationMs={result.durationMs} />

            <ResultSections result={result} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Input field helper ─────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

// ── Individual test cards ──────────────────────────────────────────────────

function useTestRunner<P>(fn: (p: P) => Promise<TestResult>) {
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async (params: P) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await fn(params);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [fn]);

  return { result, error, loading, run };
}

function GooglePlacesTest() {
  const [query, setQuery] = useState('restaurant');
  const [location, setLocation] = useState('London');
  const [limit, setLimit] = useState(5);
  const { result, error, loading, run } = useTestRunner(api.testGooglePlaces);

  return (
    <TestCard
      title="Google Places"
      description="Search local businesses via Apify Google Places scraper"
      icon={MapPin}
      result={result}
      error={error}
      loading={loading}
      onRun={() => run({ query, location, limit })}
    >
      <Field label="Query"><Input value={query} onChange={e => setQuery(e.target.value)} /></Field>
      <Field label="Location"><Input value={location} onChange={e => setLocation(e.target.value)} /></Field>
      <Field label="Limit"><Input type="number" value={limit} onChange={e => setLimit(Number(e.target.value))} min={1} max={20} /></Field>
    </TestCard>
  );
}

function ReviewsTest() {
  const [location, setLocation] = useState('London');
  const [category, setCategory] = useState('restaurant');
  const [limit, setLimit] = useState(10);
  const { result, error, loading, run } = useTestRunner(api.testReviews);

  return (
    <TestCard
      title="Reviews"
      description="Find businesses with negative payment/checkout reviews (Google Places + Claude Haiku)"
      icon={Star}
      result={result}
      error={error}
      loading={loading}
      onRun={() => run({ location, category, limit })}
    >
      <Field label="Location"><Input value={location} onChange={e => setLocation(e.target.value)} /></Field>
      <Field label="Category"><Input value={category} onChange={e => setCategory(e.target.value)} /></Field>
      <Field label="Limit"><Input type="number" value={limit} onChange={e => setLimit(Number(e.target.value))} min={1} max={20} /></Field>
    </TestCard>
  );
}

function NewsTest() {
  const [queryText, setQueryText] = useState('new restaurant opening London');
  const [limit, setLimit] = useState(3);
  const { result, error, loading, run } = useTestRunner(api.testNews);

  return (
    <TestCard
      title="News"
      description="Search news articles via Tavily + extract business names with Claude Haiku"
      icon={Newspaper}
      result={result}
      error={error}
      loading={loading}
      onRun={() => run({ queries: [queryText], limit })}
    >
      <Field label="Search Query">
        <Input value={queryText} onChange={e => setQueryText(e.target.value)} className="col-span-2" />
      </Field>
      <Field label="Limit"><Input type="number" value={limit} onChange={e => setLimit(Number(e.target.value))} min={1} max={10} /></Field>
    </TestCard>
  );
}

function ListingsTest() {
  const [platform, setPlatform] = useState<'opentable' | 'ubereats' | 'justeat'>('justeat');
  const [location, setLocation] = useState('London');
  const [limit, setLimit] = useState(5);
  const { result, error, loading, run } = useTestRunner(api.testListings);

  return (
    <TestCard
      title="Listings"
      description="Search delivery/booking platforms via Exa domain-scoped search"
      icon={Store}
      result={result}
      error={error}
      loading={loading}
      onRun={() => run({ platform, location, limit })}
    >
      <Field label="Platform">
        <Select value={platform} onValueChange={(v) => setPlatform(v as typeof platform)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="justeat">Just Eat</SelectItem>
            <SelectItem value="ubereats">Uber Eats</SelectItem>
            <SelectItem value="opentable">OpenTable</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Location"><Input value={location} onChange={e => setLocation(e.target.value)} /></Field>
      <Field label="Limit"><Input type="number" value={limit} onChange={e => setLimit(Number(e.target.value))} min={1} max={20} /></Field>
    </TestCard>
  );
}

function SocialTest() {
  const [platform, setPlatform] = useState<'instagram' | 'twitter' | 'youtube' | 'reddit' | 'linkedin'>('twitter');
  const [keywords, setKeywords] = useState('hospitality tech');
  const [limit, setLimit] = useState(3);
  const { result, error, loading, run } = useTestRunner(api.testSocial);

  return (
    <TestCard
      title="Social Media"
      description="Search social platforms for posts via Apify actors"
      icon={MessageSquare}
      result={result}
      error={error}
      loading={loading}
      onRun={() => run({ platform, keywords: keywords.split(',').map(k => k.trim()).filter(Boolean), limit })}
    >
      <Field label="Platform">
        <Select value={platform} onValueChange={(v) => setPlatform(v as typeof platform)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="twitter">Twitter</SelectItem>
            <SelectItem value="instagram">Instagram</SelectItem>
            <SelectItem value="linkedin">LinkedIn</SelectItem>
            <SelectItem value="reddit">Reddit</SelectItem>
            <SelectItem value="youtube">YouTube</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Keywords (comma-separated)"><Input value={keywords} onChange={e => setKeywords(e.target.value)} /></Field>
      <Field label="Limit"><Input type="number" value={limit} onChange={e => setLimit(Number(e.target.value))} min={1} max={10} /></Field>
    </TestCard>
  );
}

function SocialCompaniesTest() {
  const [platform, setPlatform] = useState<'instagram' | 'twitter' | 'youtube' | 'reddit' | 'linkedin'>('linkedin');
  const [keywords, setKeywords] = useState('hospitality tech');
  const [limit, setLimit] = useState(5);
  const { result, error, loading, run } = useTestRunner(api.testSocialCompanies);

  return (
    <TestCard
      title="Social → Companies"
      description="Extract target companies from social posts using LLM analysis (dry-run, no DB writes)"
      icon={Building2}
      result={result}
      error={error}
      loading={loading}
      onRun={() => run({ platform, keywords: keywords.split(',').map(k => k.trim()).filter(Boolean), limit })}
    >
      <Field label="Platform">
        <Select value={platform} onValueChange={(v) => setPlatform(v as typeof platform)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="linkedin">LinkedIn</SelectItem>
            <SelectItem value="twitter">Twitter</SelectItem>
            <SelectItem value="instagram">Instagram</SelectItem>
            <SelectItem value="reddit">Reddit</SelectItem>
            <SelectItem value="youtube">YouTube</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Keywords (comma-separated)"><Input value={keywords} onChange={e => setKeywords(e.target.value)} /></Field>
      <Field label="Limit"><Input type="number" value={limit} onChange={e => setLimit(Number(e.target.value))} min={1} max={10} /></Field>
    </TestCard>
  );
}

function EvidenceTest() {
  const [query, setQuery] = useState('hospitality payment technology');
  const [category, setCategory] = useState<'news' | 'tweet'>('news');
  const [limit, setLimit] = useState(3);
  const { result, error, loading, run } = useTestRunner(api.testEvidence);

  return (
    <TestCard
      title="Evidence Search"
      description="Search Exa for news articles or tweets matching a query"
      icon={Search}
      result={result}
      error={error}
      loading={loading}
      onRun={() => run({ query, category, limit })}
    >
      <Field label="Query"><Input value={query} onChange={e => setQuery(e.target.value)} /></Field>
      <Field label="Category">
        <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="news">News</SelectItem>
            <SelectItem value="tweet">Tweets</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Limit"><Input type="number" value={limit} onChange={e => setLimit(Number(e.target.value))} min={1} max={10} /></Field>
    </TestCard>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function DiscoveryTestPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Discovery Test Suite</h1>
        <p className="text-muted-foreground">
          Test each discovery method in isolation with small limits. No DB writes — results shown inline.
        </p>
      </div>

      <GooglePlacesTest />
      <ReviewsTest />
      <NewsTest />
      <ListingsTest />
      <SocialTest />
      <SocialCompaniesTest />
      <EvidenceTest />
    </div>
  );
}

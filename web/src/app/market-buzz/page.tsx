'use client';

import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { useBuzzReports, useBuzzReport, useGenerateBuzzReport, useDeleteBuzzReport } from '@/lib/hooks/use-market-buzz';
import { useJob } from '@/lib/hooks/use-jobs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ErrorBanner } from '@/components/shared/error-banner';
import { formatRelativeTime } from '@/lib/utils';
import {
  TrendingUp,
  Presentation,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Copy,
  Check,
  Loader2,
  Trash2,
  Sparkles,
} from 'lucide-react';
import type { TrendingTopic, WebinarAngle, SeedCopy, BuzzReportSummary } from '@/lib/api/market-buzz';

const APPEAL_COLORS: Record<string, string> = {
  high: 'bg-green-500/10 text-green-700 border-green-200',
  medium: 'bg-yellow-500/10 text-yellow-700 border-yellow-200',
  low: 'bg-gray-500/10 text-gray-700 border-gray-200',
};

const COPY_TYPE_LABELS: Record<string, string> = {
  email_subject: 'Email Subject',
  email_body: 'Email Body',
  linkedin_post: 'LinkedIn Post',
  linkedin_inmessage: 'LinkedIn InMail',
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
}

function BuzzScoreBadge({ score }: { score: number }) {
  const color = score >= 70
    ? 'bg-red-500/10 text-red-700 border-red-200'
    : score >= 40
      ? 'bg-orange-500/10 text-orange-700 border-orange-200'
      : 'bg-gray-500/10 text-gray-700 border-gray-200';
  return (
    <Badge className={`${color} font-mono text-xs`}>
      {score}/100
    </Badge>
  );
}

const AUTHORITY_LABELS: Record<string, string> = {
  major: 'Major outlet',
  niche: 'Niche/trade',
  unknown: '',
};

function TopicCard({ topic }: { topic: TrendingTopic }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-base">{topic.topic}</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline">{topic.category}</Badge>
              <BuzzScoreBadge score={topic.buzzScore ?? 0} />
              <span className="text-xs text-muted-foreground">
                {topic.sourceCount ?? 0} source{(topic.sourceCount ?? 0) !== 1 ? 's' : ''}
              </span>
              <span className="text-xs text-muted-foreground">
                ~{Math.round(topic.recencyDays ?? 0)}d avg age
              </span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-sm font-medium">
              {Math.round(topic.clientRelevance.overlapScore * 100)}% overlap
            </div>
            <Progress value={topic.clientRelevance.overlapScore * 100} className="w-24 h-2 mt-1" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{topic.description}</p>

        {/* Key sources */}
        {topic.sources && topic.sources.length > 0 && (
          <div>
            <p className="text-xs font-medium mb-1.5">Key Sources</p>
            <div className="space-y-1">
              {topic.sources.map((source, i) => (
                <a
                  key={i}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs hover:bg-muted rounded px-2 py-1 -mx-2 transition-colors group"
                >
                  <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground group-hover:text-foreground" />
                  <span className="truncate font-medium">{source.title}</span>
                  <span className="shrink-0 text-muted-foreground">{source.domain}</span>
                  {source.authority && source.authority !== 'unknown' && (
                    <Badge variant="outline" className="text-[10px] shrink-0 py-0">
                      {AUTHORITY_LABELS[source.authority]}
                    </Badge>
                  )}
                </a>
              ))}
            </div>
          </div>
        )}

        {topic.clientRelevance.matchingProducts.length > 0 && (
          <div>
            <p className="text-xs font-medium mb-1">Matching Products</p>
            <div className="flex flex-wrap gap-1">
              {topic.clientRelevance.matchingProducts.map((p) => (
                <Badge key={p} variant="secondary" className="text-xs">{p}</Badge>
              ))}
            </div>
          </div>
        )}

        {topic.clientRelevance.reasoning && (
          <p className="text-xs text-muted-foreground italic">{topic.clientRelevance.reasoning}</p>
        )}

        <div className="flex flex-wrap gap-1">
          {topic.affectedSegments.map((seg) => (
            <Badge key={seg} variant="outline" className="text-xs">{seg}</Badge>
          ))}
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {topic.supportingSignals.length} supporting signals
        </button>

        {expanded && (
          <div className="space-y-2 pl-4 border-l-2">
            {topic.supportingSignals.map((signal, i) => (
              <div key={i} className="text-xs">
                <p className="font-medium">{signal.headline}</p>
                <div className="flex items-center gap-2 mt-0.5 text-muted-foreground">
                  <span>{formatRelativeTime(signal.detectedAt)}</span>
                  {signal.sourceDomain && <span>{signal.sourceDomain}</span>}
                  {signal.sourceUrl && (
                    <a href={signal.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 hover:text-foreground">
                      Source <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WebinarCard({ angle }: { angle: WebinarAngle }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{angle.title}</CardTitle>
          <Badge className={APPEAL_COLORS[angle.estimatedAppeal]}>
            {angle.estimatedAppeal} appeal
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{angle.description}</p>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs font-medium mb-1">Trend Connection</p>
            <p className="text-muted-foreground">{angle.trendConnection}</p>
          </div>
          <div>
            <p className="text-xs font-medium mb-1">Client Angle</p>
            <p className="text-muted-foreground">{angle.clientAngle}</p>
          </div>
        </div>

        <div>
          <p className="text-xs font-medium mb-1">Target Segments</p>
          <div className="flex flex-wrap gap-1">
            {angle.targetSegments.map((seg) => (
              <Badge key={seg} variant="outline" className="text-xs">{seg}</Badge>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium mb-1">Talking Points</p>
          <ul className="list-disc list-inside text-sm text-muted-foreground space-y-0.5">
            {angle.talkingPoints.map((point, i) => (
              <li key={i}>{point}</li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function CopyCard({ copy }: { copy: SeedCopy }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{COPY_TYPE_LABELS[copy.type] ?? copy.type}</Badge>
            <Badge variant="outline" className="text-xs">{copy.topic}</Badge>
          </div>
          <CopyButton text={copy.content} />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="bg-muted rounded-md p-3 text-sm font-mono whitespace-pre-wrap">
          {copy.content}
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>Segment: {copy.targetSegment}</span>
          <span>Tone: {copy.tone}</span>
          <span>CTA: {copy.cta}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function ReportHistory({
  reports,
  currentId,
  onSelect,
  onDelete,
  deletingId,
}: {
  reports: BuzzReportSummary[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  deletingId: string | null;
}) {
  if (reports.length <= 1) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Report History</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {reports.map((r) => (
            <div
              key={r.id}
              className={`flex items-center justify-between rounded-md px-3 py-2 text-sm cursor-pointer transition-colors ${
                r.id === currentId ? 'bg-primary/10' : 'hover:bg-muted'
              }`}
              onClick={() => onSelect(r.id)}
            >
              <div>
                <span className="font-medium">{r.timeWindowDays}d window</span>
                <span className="text-muted-foreground ml-2">
                  {r.topicsCount ?? 0} topics, {r.webinarAnglesCount ?? 0} angles
                </span>
                <span className="text-muted-foreground ml-2">
                  {formatRelativeTime(r.createdAt)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={r.status === 'completed' ? 'secondary' : r.status === 'failed' ? 'destructive' : 'outline'}>
                  {r.status}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={deletingId === r.id}
                  onClick={(e) => { e.stopPropagation(); onDelete(r.id); }}
                >
                  {deletingId === r.id
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Trash2 className="h-3 w-3" />}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function MarketBuzzPage() {
  const { selectedClientId } = useAppStore();
  const [timeWindow, setTimeWindow] = useState('30');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [copyFilter, setCopyFilter] = useState<string>('all');
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null);

  const { data: reports, isLoading, isError, refetch } = useBuzzReports(selectedClientId ?? undefined);
  const generateMutation = useGenerateBuzzReport();
  const deleteMutation = useDeleteBuzzReport();

  // If no explicit selection, use latest completed
  const latestCompleted = reports?.find((r) => r.status === 'completed');
  const viewingId = selectedReportId ?? latestCompleted?.id ?? null;
  const { data: reportDetail } = useBuzzReport(viewingId);

  // Poll active job
  const { data: activeJob } = useJob(activeJobId);
  const isGenerating = activeJobId !== null && activeJob?.status === 'running';

  // If job completed, clear it and refresh reports
  if (activeJob && (activeJob.status === 'completed' || activeJob.status === 'failed')) {
    setActiveJobId(null);
    refetch();
  }

  const report = reportDetail?.report;

  const handleGenerate = () => {
    if (!selectedClientId) return;
    generateMutation.mutate(
      { clientId: selectedClientId, timeWindowDays: parseInt(timeWindow), forceRegenerate: true },
      {
        onSuccess: (data) => setActiveJobId(data.jobId),
      },
    );
  };

  if (!selectedClientId) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        Select a client to view market buzz reports
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Market Buzz</h1>
          <p className="text-muted-foreground">
            Trending topics, webinar angles, and content ideas from your signal data
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={timeWindow} onValueChange={setTimeWindow}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || generateMutation.isPending}
          >
            {isGenerating || generateMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Generate Report
          </Button>
        </div>
      </div>

      {/* Generating indicator */}
      {isGenerating && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center gap-3 py-4">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <div>
              <p className="font-medium">Generating buzz report...</p>
              <p className="text-sm text-muted-foreground">
                Analyzing signals and generating content ideas. This may take a minute.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading / error / empty states */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">Loading...</div>
      ) : isError ? (
        <ErrorBanner retry={refetch} />
      ) : !reports?.length && !isGenerating ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No buzz reports yet</h3>
            <p className="text-muted-foreground text-sm mb-4 text-center max-w-md">
              Generate a report to discover trending topics across your market signals,
              get webinar angle ideas, and seed email/LinkedIn copy.
            </p>
            <Button onClick={handleGenerate} disabled={generateMutation.isPending}>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate First Report
            </Button>
          </CardContent>
        </Card>
      ) : report ? (
        <>
          {/* Summary cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Signals Analyzed
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{report.inputSummary.signalsAnalyzed}</p>
                <p className="text-xs text-muted-foreground">
                  {report.timeWindow.days}-day window
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Trending Topics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{report.trendingTopics.length}</p>
                <p className="text-xs text-muted-foreground">
                  across {report.inputSummary.icpSegments.length} segments
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Webinar Angles
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{report.webinarAngles.length}</p>
                <p className="text-xs text-muted-foreground">
                  {report.seedCopy.length} content snippets
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Main content tabs */}
          <Tabs defaultValue="topics">
            <TabsList>
              <TabsTrigger value="topics" className="gap-2">
                <TrendingUp className="h-3.5 w-3.5" />
                Trending Topics
              </TabsTrigger>
              <TabsTrigger value="webinars" className="gap-2">
                <Presentation className="h-3.5 w-3.5" />
                Webinar Angles
              </TabsTrigger>
              <TabsTrigger value="copy" className="gap-2">
                <MessageSquare className="h-3.5 w-3.5" />
                Seed Copy
              </TabsTrigger>
            </TabsList>

            <TabsContent value="topics" className="mt-4">
              <div className="grid gap-4 md:grid-cols-2">
                {report.trendingTopics.map((topic, i) => (
                  <TopicCard key={i} topic={topic} />
                ))}
              </div>
              {report.trendingTopics.length === 0 && (
                <p className="text-center py-8 text-muted-foreground">No trending topics found for this time window.</p>
              )}
            </TabsContent>

            <TabsContent value="webinars" className="mt-4">
              <div className="grid gap-4 md:grid-cols-2">
                {report.webinarAngles.map((angle, i) => (
                  <WebinarCard key={i} angle={angle} />
                ))}
              </div>
              {report.webinarAngles.length === 0 && (
                <p className="text-center py-8 text-muted-foreground">No webinar angles generated.</p>
              )}
            </TabsContent>

            <TabsContent value="copy" className="mt-4 space-y-4">
              <div className="flex items-center gap-2">
                <Select value={copyFilter} onValueChange={setCopyFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="email_subject">Email Subject</SelectItem>
                    <SelectItem value="email_body">Email Body</SelectItem>
                    <SelectItem value="linkedin_post">LinkedIn Post</SelectItem>
                    <SelectItem value="linkedin_inmessage">LinkedIn InMail</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-4">
                {report.seedCopy
                  .filter((c) => copyFilter === 'all' || c.type === copyFilter)
                  .map((copy, i) => (
                    <CopyCard key={i} copy={copy} />
                  ))}
              </div>
              {report.seedCopy.length === 0 && (
                <p className="text-center py-8 text-muted-foreground">No content snippets generated.</p>
              )}
            </TabsContent>
          </Tabs>

          {/* Report history */}
          {reports && (
            <ReportHistory
              reports={reports}
              currentId={viewingId}
              onSelect={setSelectedReportId}
              onDelete={(id) => {
                setDeletingReportId(id);
                deleteMutation.mutate(id, {
                  onSettled: () => setDeletingReportId(null),
                });
              }}
              deletingId={deletingReportId}
            />
          )}
        </>
      ) : null}
    </div>
  );
}

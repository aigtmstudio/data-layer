'use client';

import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { useHypotheses, useGenerateHypotheses, useUpdateHypothesis, useDeleteHypothesis } from '@/lib/hooks/use-hypotheses';
import { useMarketSignals, useProcessSignals } from '@/lib/hooks/use-market-signals';
import { usePersonasV2 } from '@/lib/hooks/use-personas-v2';
import { DataTable } from '@/components/shared/data-table';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatRelativeTime } from '@/lib/utils';
import { Radio, RefreshCw, ExternalLink, Sparkles, MoreHorizontal, Pause, PlayCircle, Trash2, Building, UserCircle } from 'lucide-react';
import { toast } from 'sonner';
import { ErrorBanner } from '@/components/shared/error-banner';
import type { ColumnDef } from '@tanstack/react-table';
import type { MarketSignal, SignalHypothesis, SignalLevel } from '@/lib/types';

// --- Category colours ---
const categoryColors: Record<string, string> = {
  // Market
  regulatory: 'bg-red-100 text-red-700',
  economic: 'bg-blue-100 text-blue-700',
  industry: 'bg-purple-100 text-purple-700',
  competitive: 'bg-orange-100 text-orange-700',
  // Company
  funding: 'bg-green-100 text-green-700',
  hiring: 'bg-sky-100 text-sky-700',
  tech_adoption: 'bg-indigo-100 text-indigo-700',
  expansion: 'bg-teal-100 text-teal-700',
  leadership: 'bg-amber-100 text-amber-700',
  product_launch: 'bg-pink-100 text-pink-700',
  // Persona
  job_change: 'bg-violet-100 text-violet-700',
  title_match: 'bg-cyan-100 text-cyan-700',
  seniority_match: 'bg-lime-100 text-lime-700',
  tenure_signal: 'bg-rose-100 text-rose-700',
};

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  paused: 'bg-amber-100 text-amber-700',
  retired: 'bg-gray-100 text-gray-600',
};

// --- Hypothesis table ---

function HypothesesSection({
  clientId,
  signalLevel,
  personaId,
}: {
  clientId: string;
  signalLevel: SignalLevel;
  personaId?: string;
}) {
  const { data: hypotheses, isLoading, isError, refetch } = useHypotheses(clientId, { signalLevel });
  const generateHypotheses = useGenerateHypotheses();
  const updateHypothesis = useUpdateHypothesis();
  const deleteHypothesis = useDeleteHypothesis();

  const handleGenerate = async () => {
    try {
      await generateHypotheses.mutateAsync({
        clientId,
        signalLevel,
        personaId,
      });
      toast.success(`${signalLevel} hypothesis generation started`);
    } catch {
      toast.error('Failed to generate hypotheses');
    }
  };

  const handleToggleStatus = async (id: string, current: string) => {
    const newStatus = current === 'active' ? 'paused' : 'active';
    try {
      await updateHypothesis.mutateAsync({ id, data: { status: newStatus } });
      toast.success(`Hypothesis ${newStatus}`);
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteHypothesis.mutateAsync(id);
      toast.success('Hypothesis deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  const columns: ColumnDef<SignalHypothesis>[] = [
    {
      accessorKey: 'hypothesis',
      header: 'Hypothesis',
      cell: ({ row }) => (
        <span className="line-clamp-2 max-w-md text-sm">{row.original.hypothesis}</span>
      ),
    },
    {
      accessorKey: 'signalCategory',
      header: 'Category',
      cell: ({ row }) => (
        <Badge variant="outline" className={categoryColors[row.original.signalCategory] ?? ''}>
          {row.original.signalCategory.replace('_', ' ')}
        </Badge>
      ),
    },
    {
      accessorKey: 'priority',
      header: 'Priority',
      cell: ({ row }) => (
        <span className="text-sm font-mono">{row.original.priority}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant="outline" className={statusColors[row.original.status] ?? ''}>
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: 'validatedBy',
      header: 'Source',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.validatedBy === 'llm_generated' ? 'AI' : row.original.validatedBy === 'human_created' ? 'Manual' : 'Validated'}
        </span>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm"><MoreHorizontal className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleToggleStatus(row.original.id, row.original.status)}>
              {row.original.status === 'active' ? (
                <><Pause className="mr-2 h-4 w-4" />Pause</>
              ) : (
                <><PlayCircle className="mr-2 h-4 w-4" />Activate</>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDelete(row.original.id)} className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  if (isError) return <ErrorBanner title="Failed to load hypotheses" retry={() => refetch()} />;

  const activeCount = hypotheses?.filter(h => h.status === 'active').length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Hypotheses</h3>
          <p className="text-xs text-muted-foreground">
            {activeCount} active hypothesis{activeCount !== 1 ? 'es' : ''}
          </p>
        </div>
        <Button
          onClick={handleGenerate}
          disabled={generateHypotheses.isPending}
          size="sm"
        >
          <Sparkles className="mr-2 h-4 w-4" />
          {generateHypotheses.isPending ? 'Generating...' : 'Generate'}
        </Button>
      </div>
      {isLoading ? (
        <div className="py-4 text-center text-muted-foreground">Loading...</div>
      ) : hypotheses && hypotheses.length > 0 ? (
        <DataTable columns={columns} data={hypotheses} />
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-8">
            <p className="text-sm text-muted-foreground mb-3">
              No {signalLevel} hypotheses yet. Generate them to start detecting signals.
            </p>
            <Button onClick={handleGenerate} disabled={generateHypotheses.isPending} variant="outline" size="sm">
              <Sparkles className="mr-2 h-4 w-4" />
              Generate Hypotheses
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// --- Market Signal Feed ---

function MarketSignalFeed({ clientId }: { clientId: string }) {
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [processedFilter, setProcessedFilter] = useState<string>('all');
  const [selectedSignal, setSelectedSignal] = useState<MarketSignal | null>(null);
  const processSignals = useProcessSignals();

  const { data, isLoading, isError, refetch } = useMarketSignals(clientId, {
    category: categoryFilter !== 'all' ? categoryFilter : undefined,
    processed: processedFilter !== 'all' ? processedFilter === 'true' : undefined,
    limit: 100,
  });

  const handleProcess = async () => {
    try {
      await processSignals.mutateAsync({ clientId });
      toast.success('Signal processing started');
    } catch {
      toast.error('Failed to process signals');
    }
  };

  const signalColumns: ColumnDef<MarketSignal>[] = [
    {
      accessorKey: 'headline',
      header: 'Headline',
      cell: ({ row }) => (
        <span className="line-clamp-1 max-w-xs text-sm font-medium">{row.original.headline}</span>
      ),
    },
    {
      accessorKey: 'signalCategory',
      header: 'Category',
      cell: ({ row }) =>
        row.original.signalCategory ? (
          <Badge variant="outline" className={categoryColors[row.original.signalCategory] ?? ''}>
            {row.original.signalCategory}
          </Badge>
        ) : (
          <Badge variant="outline">unclassified</Badge>
        ),
    },
    {
      accessorKey: 'sourceName',
      header: 'Source',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.sourceName ?? '-'}</span>
      ),
    },
    {
      accessorKey: 'relevanceScore',
      header: 'Relevance',
      cell: ({ row }) =>
        row.original.relevanceScore
          ? `${(parseFloat(row.original.relevanceScore) * 100).toFixed(0)}%`
          : '-',
    },
    {
      accessorKey: 'processed',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.processed ? 'default' : 'secondary'}>
          {row.original.processed ? 'Classified' : 'Pending'}
        </Badge>
      ),
    },
    {
      accessorKey: 'detectedAt',
      header: 'Detected',
      cell: ({ row }) => formatRelativeTime(row.original.detectedAt),
    },
  ];

  if (isError) return <ErrorBanner title="Failed to load signals" retry={() => refetch()} />;

  const signals = data?.signals ?? [];
  const total = data?.total ?? 0;
  const unprocessedCount = signals.filter(s => !s.processed).length;
  const highRelevanceCount = signals.filter(s => s.relevanceScore && parseFloat(s.relevanceScore) >= 0.7).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Detected Signals</h3>
        <Button onClick={handleProcess} disabled={processSignals.isPending} size="sm" variant="outline">
          <RefreshCw className={`mr-2 h-4 w-4 ${processSignals.isPending ? 'animate-spin' : ''}`} />
          {processSignals.isPending ? 'Processing...' : 'Process Signals'}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{total}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Pending</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{unprocessedCount}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">High Relevance</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{highRelevanceCount}</p></CardContent>
        </Card>
      </div>

      <div className="flex gap-3">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="regulatory">Regulatory</SelectItem>
            <SelectItem value="economic">Economic</SelectItem>
            <SelectItem value="industry">Industry</SelectItem>
            <SelectItem value="competitive">Competitive</SelectItem>
          </SelectContent>
        </Select>
        <Select value={processedFilter} onValueChange={setProcessedFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="true">Classified</SelectItem>
            <SelectItem value="false">Pending</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="py-4 text-center text-muted-foreground">Loading...</div>
      ) : (
        <DataTable columns={signalColumns} data={signals} onRowClick={(signal) => setSelectedSignal(signal)} />
      )}

      {/* Signal Detail Dialog */}
      <Dialog open={!!selectedSignal} onOpenChange={(open) => !open && setSelectedSignal(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="pr-8">{selectedSignal?.headline}</DialogTitle>
          </DialogHeader>
          {selectedSignal && (
            <div className="space-y-4">
              {selectedSignal.summary && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Summary</p>
                  <p className="text-sm">{selectedSignal.summary}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Category</p>
                  {selectedSignal.signalCategory ? (
                    <Badge variant="outline" className={categoryColors[selectedSignal.signalCategory] ?? ''}>
                      {selectedSignal.signalCategory}
                    </Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">Unclassified</span>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Relevance</p>
                  <p className="text-sm font-mono">
                    {selectedSignal.relevanceScore
                      ? `${(parseFloat(selectedSignal.relevanceScore) * 100).toFixed(0)}%`
                      : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Source</p>
                  <p className="text-sm">{selectedSignal.sourceName ?? '-'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Detected</p>
                  <p className="text-sm">{formatRelativeTime(selectedSignal.detectedAt)}</p>
                </div>
              </div>
              {selectedSignal.affectedSegments?.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Affected Segments</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedSignal.affectedSegments.map((seg) => (
                      <Badge key={seg} variant="secondary" className="text-xs">{seg}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {selectedSignal.sourceUrl && (
                <a
                  href={selectedSignal.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  View Source
                </a>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --- Main page ---

export default function SignalsPage() {
  const { selectedClientId } = useAppStore();
  const [activeTab, setActiveTab] = useState<string>('market');
  const { data: personas } = usePersonasV2(selectedClientId);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>('');

  if (!selectedClientId) {
    return (
      <EmptyState
        icon={Radio}
        title="No client selected"
        description="Select a client from the header to view signals."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Radio className="h-6 w-6" />
          Signals
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage signal hypotheses and detected signals across all levels.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="market" className="gap-2">
            <Radio className="h-4 w-4" />
            Market
          </TabsTrigger>
          <TabsTrigger value="company" className="gap-2">
            <Building className="h-4 w-4" />
            Company
          </TabsTrigger>
          <TabsTrigger value="persona" className="gap-2">
            <UserCircle className="h-4 w-4" />
            Persona
          </TabsTrigger>
        </TabsList>

        {/* Market Tab */}
        <TabsContent value="market" className="space-y-8">
          <HypothesesSection clientId={selectedClientId} signalLevel="market" />
          <MarketSignalFeed clientId={selectedClientId} />
        </TabsContent>

        {/* Company Tab */}
        <TabsContent value="company" className="space-y-8">
          <HypothesesSection clientId={selectedClientId} signalLevel="company" />
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center py-8">
              <Building className="h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground text-center max-w-md">
                Company signals are detected when you run &quot;Run Company Signals&quot; on a list&apos;s Active Segment stage.
                Detected signals appear on each company in the list detail view.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Persona Tab */}
        <TabsContent value="persona" className="space-y-8">
          {/* Persona selector for generation */}
          <div className="flex items-center gap-3">
            <Select value={selectedPersonaId} onValueChange={setSelectedPersonaId}>
              <SelectTrigger className="w-[240px]">
                <SelectValue placeholder="Select persona for generation..." />
              </SelectTrigger>
              <SelectContent>
                {personas?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(!personas || personas.length === 0) && (
              <p className="text-xs text-muted-foreground">
                Create a persona first to generate persona-level hypotheses.
              </p>
            )}
          </div>
          <HypothesesSection
            clientId={selectedClientId}
            signalLevel="persona"
            personaId={selectedPersonaId || undefined}
          />
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center py-8">
              <UserCircle className="h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground text-center max-w-md">
                Persona signals are detected when you run &quot;Run Persona Signals&quot; on a contact list.
                They score individual contacts based on job changes, title match, seniority, and tenure.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

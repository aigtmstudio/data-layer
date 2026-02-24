'use client';

import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { useMarketSignals, useProcessSignals } from '@/lib/hooks/use-market-signals';
import { DataTable } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { formatRelativeTime } from '@/lib/utils';
import { Radio, RefreshCw, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { ErrorBanner } from '@/components/shared/error-banner';
import type { ColumnDef } from '@tanstack/react-table';
import type { MarketSignal } from '@/lib/types';

const categoryColors: Record<string, string> = {
  regulatory: 'bg-red-100 text-red-700',
  economic: 'bg-blue-100 text-blue-700',
  technology: 'bg-purple-100 text-purple-700',
  competitive: 'bg-orange-100 text-orange-700',
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

export default function SignalsPage() {
  const { selectedClientId } = useAppStore();
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [processedFilter, setProcessedFilter] = useState<string>('all');
  const [selectedSignal, setSelectedSignal] = useState<MarketSignal | null>(null);

  const processSignals = useProcessSignals();

  const { data, isLoading, isError, refetch } = useMarketSignals(
    selectedClientId,
    {
      category: categoryFilter !== 'all' ? categoryFilter : undefined,
      processed: processedFilter !== 'all' ? processedFilter === 'true' : undefined,
      limit: 100,
    },
  );

  const handleProcess = async () => {
    try {
      await processSignals.mutateAsync({ clientId: selectedClientId ?? undefined });
      toast.success('Signal processing started');
    } catch {
      toast.error('Failed to process signals');
    }
  };

  if (!selectedClientId) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Select a client to view market signals.
      </div>
    );
  }

  if (isError) {
    return <ErrorBanner title="Failed to load signals" description="Could not load market signal data." retry={() => refetch()} />;
  }

  const signals = data?.signals ?? [];
  const total = data?.total ?? 0;

  const unprocessedCount = signals.filter(s => !s.processed).length;
  const highRelevanceCount = signals.filter(s => s.relevanceScore && parseFloat(s.relevanceScore) >= 0.7).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Radio className="h-6 w-6" />
            Market Signals
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Market events and signals classified against your hypotheses.
          </p>
        </div>
        <Button
          onClick={handleProcess}
          disabled={processSignals.isPending}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${processSignals.isPending ? 'animate-spin' : ''}`} />
          {processSignals.isPending ? 'Processing...' : 'Process Signals'}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Signals</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending Classification</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{unprocessedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">High Relevance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{highRelevanceCount}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-3">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="regulatory">Regulatory</SelectItem>
            <SelectItem value="economic">Economic</SelectItem>
            <SelectItem value="technology">Technology</SelectItem>
            <SelectItem value="competitive">Competitive</SelectItem>
          </SelectContent>
        </Select>

        <Select value={processedFilter} onValueChange={setProcessedFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="true">Classified</SelectItem>
            <SelectItem value="false">Pending</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">Loading...</div>
      ) : (
        <DataTable
          columns={signalColumns}
          data={signals}
          onRowClick={(signal) => setSelectedSignal(signal)}
        />
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
                      <Badge key={seg} variant="secondary" className="text-xs">
                        {seg}
                      </Badge>
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

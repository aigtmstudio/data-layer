'use client';

import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { useLlmUsageSummary, useLlmUsageRecent, useProviderCostSummary } from '@/lib/hooks/use-llm-usage';
import { DataTable } from '@/components/shared/data-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatCurrency, formatNumber, formatRelativeTime } from '@/lib/utils';
import { ErrorBanner } from '@/components/shared/error-banner';
import type { ColumnDef } from '@tanstack/react-table';
import type { LlmUsageRecord, LlmUsageSummary, ProviderCostSummary } from '@/lib/types';

type ServiceRow = LlmUsageSummary['byService'][number];
type ProviderRow = ProviderCostSummary['byProvider'][number];
type ProviderUsageRow = ProviderCostSummary['recentUsage'][number];

export default function CostsPage() {
  const { selectedClientId } = useAppStore();
  const [period, setPeriod] = useState('30');

  const {
    data: llmSummary,
    isLoading: llmLoading,
    isError: llmError,
    refetch: refetchLlm,
  } = useLlmUsageSummary({
    clientId: selectedClientId ?? undefined,
    days: parseInt(period, 10),
  });

  const {
    data: providerSummary,
    isLoading: providerLoading,
    isError: providerError,
    refetch: refetchProvider,
  } = useProviderCostSummary({
    clientId: selectedClientId ?? undefined,
    days: parseInt(period, 10),
  });

  const {
    data: recentLlm,
    isLoading: recentLlmLoading,
    isError: recentLlmError,
    refetch: refetchRecentLlm,
  } = useLlmUsageRecent({
    clientId: selectedClientId ?? undefined,
    limit: 50,
  });

  // Combined totals
  const llmCost = parseFloat(llmSummary?.totals?.totalCostUsd ?? '0');
  const providerCost = parseFloat(providerSummary?.totals?.totalCreditsUsed ?? '0');
  const totalCost = llmCost + providerCost;

  const isLoading = llmLoading || providerLoading;
  const isError = llmError || providerError;

  // LLM by service columns
  const llmServiceColumns: ColumnDef<ServiceRow>[] = [
    {
      accessorKey: 'service',
      header: 'Service',
      cell: ({ row }) => <span className="font-medium">{row.original.service}</span>,
    },
    {
      accessorKey: 'model',
      header: 'Model',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.model}</span>,
    },
    {
      accessorKey: 'calls',
      header: 'Calls',
      cell: ({ row }) => formatNumber(row.original.calls),
    },
    {
      accessorKey: 'inputTokens',
      header: 'Input Tokens',
      cell: ({ row }) => formatNumber(row.original.inputTokens),
    },
    {
      accessorKey: 'outputTokens',
      header: 'Output Tokens',
      cell: ({ row }) => formatNumber(row.original.outputTokens),
    },
    {
      accessorKey: 'costUsd',
      header: 'Cost',
      cell: ({ row }) => <span className="font-medium">{formatCurrency(row.original.costUsd, 4)}</span>,
    },
  ];

  // Provider by source columns
  const providerColumns: ColumnDef<ProviderRow>[] = [
    {
      accessorKey: 'provider',
      header: 'Provider',
      cell: ({ row }) => <span className="font-medium">{row.original.provider ?? 'unknown'}</span>,
    },
    {
      accessorKey: 'operation',
      header: 'Operation',
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.operation ?? '-'}</span>,
    },
    {
      accessorKey: 'calls',
      header: 'Calls',
      cell: ({ row }) => formatNumber(row.original.calls),
    },
    {
      accessorKey: 'baseCost',
      header: 'Base Cost',
      cell: ({ row }) => formatCurrency(row.original.baseCost, 2),
    },
    {
      accessorKey: 'margin',
      header: 'Margin',
      cell: ({ row }) => formatCurrency(row.original.margin, 2),
    },
    {
      accessorKey: 'creditsUsed',
      header: 'Total Credits',
      cell: ({ row }) => <span className="font-medium">{formatCurrency(row.original.creditsUsed, 2)}</span>,
    },
  ];

  // Recent LLM calls columns
  const recentLlmColumns: ColumnDef<LlmUsageRecord>[] = [
    {
      accessorKey: 'createdAt',
      header: 'Time',
      cell: ({ row }) => formatRelativeTime(row.original.createdAt),
    },
    {
      accessorKey: 'service',
      header: 'Service',
      cell: ({ row }) => <span className="font-medium">{row.original.service}</span>,
    },
    {
      accessorKey: 'operation',
      header: 'Operation',
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.operation}</span>,
    },
    {
      accessorKey: 'model',
      header: 'Model',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.model}</span>,
    },
    {
      accessorKey: 'inputTokens',
      header: 'In',
      cell: ({ row }) => formatNumber(row.original.inputTokens),
    },
    {
      accessorKey: 'outputTokens',
      header: 'Out',
      cell: ({ row }) => formatNumber(row.original.outputTokens),
    },
    {
      accessorKey: 'totalCostUsd',
      header: 'Cost',
      cell: ({ row }) => <span className="font-medium">{formatCurrency(row.original.totalCostUsd, 4)}</span>,
    },
  ];

  // Recent provider usage columns
  const recentProviderColumns: ColumnDef<ProviderUsageRow>[] = [
    {
      accessorKey: 'createdAt',
      header: 'Time',
      cell: ({ row }) => formatRelativeTime(row.original.createdAt),
    },
    {
      accessorKey: 'dataSource',
      header: 'Provider',
      cell: ({ row }) => <span className="font-medium">{row.original.dataSource ?? 'unknown'}</span>,
    },
    {
      accessorKey: 'operationType',
      header: 'Operation',
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.operationType ?? '-'}</span>,
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => <span className="text-sm truncate max-w-[200px] block">{row.original.description}</span>,
    },
    {
      accessorKey: 'baseCost',
      header: 'Base',
      cell: ({ row }) => formatCurrency(row.original.baseCost ?? '0', 2),
    },
    {
      accessorKey: 'amount',
      header: 'Credits',
      cell: ({ row }) => <span className="font-medium">{formatCurrency(Math.abs(parseFloat(row.original.amount)), 2)}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Costs</h1>
          <p className="text-muted-foreground">All costs across LLM and data providers</p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Top-level summary cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">Loading...</div>
      ) : isError ? (
        <ErrorBanner retry={() => { refetchLlm(); refetchProvider(); }} />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Spend
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatCurrency(totalCost, 2)}</p>
                <p className="text-xs text-muted-foreground">LLM + providers combined</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Data Provider Credits
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatCurrency(providerCost, 2)}</p>
                <p className="text-xs text-muted-foreground">
                  {formatNumber(providerSummary?.totals?.totalCalls ?? 0)} API calls
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  LLM Costs (Anthropic)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatCurrency(llmCost, 4)}</p>
                <p className="text-xs text-muted-foreground">
                  {formatNumber(llmSummary?.totals?.totalCalls ?? 0)} API calls
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Tokens
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {formatNumber(
                    (llmSummary?.totals?.totalInputTokens ?? 0) +
                    (llmSummary?.totals?.totalOutputTokens ?? 0),
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatNumber(llmSummary?.totals?.totalInputTokens ?? 0)} in /{' '}
                  {formatNumber(llmSummary?.totals?.totalOutputTokens ?? 0)} out
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Provider Costs Section */}
          {providerSummary && providerSummary.byProvider.length > 0 && (
            <div>
              <h2 className="mb-3 text-lg font-semibold">Data Provider Costs</h2>
              <DataTable columns={providerColumns} data={providerSummary.byProvider} />
            </div>
          )}

          {/* LLM Costs Section */}
          {llmSummary && llmSummary.byService.length > 0 && (
            <div>
              <h2 className="mb-3 text-lg font-semibold">LLM Costs by Service</h2>
              <DataTable columns={llmServiceColumns} data={llmSummary.byService} />
            </div>
          )}
        </>
      )}

      {/* Recent Provider Usage */}
      {providerSummary && providerSummary.recentUsage.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">Recent Provider Usage</h2>
          <DataTable columns={recentProviderColumns} data={providerSummary.recentUsage} />
        </div>
      )}

      {/* Recent LLM Calls */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Recent LLM Calls</h2>
        {recentLlmLoading ? (
          <div className="flex items-center justify-center py-12">Loading...</div>
        ) : recentLlmError ? (
          <ErrorBanner retry={() => refetchRecentLlm()} />
        ) : (
          <DataTable columns={recentLlmColumns} data={recentLlm ?? []} />
        )}
      </div>
    </div>
  );
}

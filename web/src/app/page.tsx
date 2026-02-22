'use client';

import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import { useJobs } from '@/lib/hooks/use-jobs';
import { useClients } from '@/lib/hooks/use-clients';
import { useCreditBalance, useCreditHistory } from '@/lib/hooks/use-credits';
import { StatCard } from '@/components/shared/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatRelativeTime, getJobStatusColor } from '@/lib/utils';
import { Building2, Users, Wallet, Activity, Zap, List, Plus, TrendingUp, Receipt, DollarSign } from 'lucide-react';
import { ErrorBanner } from '@/components/shared/error-banner';

export default function DashboardPage() {
  const { selectedClientId } = useAppStore();
  const { data: clients, isError: clientsError, refetch: refetchClients } = useClients();
  const { data: jobs } = useJobs({ clientId: selectedClientId ?? undefined, limit: 10 });
  const { data: balance } = useCreditBalance(selectedClientId);
  const { data: history } = useCreditHistory(selectedClientId);

  const selectedClient = clients?.find((c) => c.id === selectedClientId);

  // Aggregate cost stats across all clients
  const totalCreditBalance = clients?.reduce((sum, c) => sum + parseFloat(c.creditBalance || '0'), 0) ?? 0;

  // Cost breakdown for selected client (from usage history)
  const usageTxns = (history ?? []).filter((t) => t.type === 'usage');
  const totalBaseCost = usageTxns.reduce((sum, t) => sum + (t.baseCost ? parseFloat(t.baseCost) : 0), 0);
  const totalMargin = usageTxns.reduce((sum, t) => sum + (t.marginAmount ? parseFloat(t.marginAmount) : 0), 0);
  const totalCharged = usageTxns.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          {selectedClient ? `Overview for ${selectedClient.name}` : 'Select a client to get started'}
        </p>
      </div>

      {clientsError && (
        <ErrorBanner retry={() => refetchClients()} />
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Clients"
          value={clients?.length ?? 0}
          icon={Building2}
        />
        <StatCard
          title="Active Clients"
          value={clients?.filter((c) => c.isActive).length ?? 0}
          icon={Users}
        />
        <StatCard
          title="Credit Balance"
          value={balance ? formatCurrency(balance.balance) : '-'}
          description={selectedClient ? selectedClient.name : 'No client selected'}
          icon={Wallet}
        />
        <StatCard
          title="All Clients Balance"
          value={formatCurrency(totalCreditBalance)}
          description={`Across ${clients?.length ?? 0} clients`}
          icon={DollarSign}
        />
      </div>

      {/* Cost Overview — shows when a client is selected and has usage */}
      {selectedClientId && usageTxns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4" />
              Cost Overview — {selectedClient?.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Receipt className="h-3.5 w-3.5" />
                  Raw Provider Cost
                </div>
                <p className="mt-1 text-xl font-bold">{formatCurrency(totalBaseCost)}</p>
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Your Margin
                </div>
                <p className="mt-1 text-xl font-bold text-green-600">{formatCurrency(totalMargin)}</p>
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <DollarSign className="h-3.5 w-3.5" />
                  Total Billed
                </div>
                <p className="mt-1 text-xl font-bold">{formatCurrency(totalCharged)}</p>
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Activity className="h-3.5 w-3.5" />
                  Operations
                </div>
                <p className="mt-1 text-xl font-bold">{usageTxns.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3">
        <Button asChild>
          <Link href="/enrichment">
            <Zap className="mr-2 h-4 w-4" />
            New Enrichment
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/lists">
            <List className="mr-2 h-4 w-4" />
            Build List
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/clients">
            <Plus className="mr-2 h-4 w-4" />
            Add Client
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          {!jobs?.length ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No recent jobs</p>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div className="flex items-center gap-3">
                    <Badge className={getJobStatusColor(job.status)} variant="outline">
                      {job.status}
                    </Badge>
                    <div>
                      <p className="text-sm font-medium">{job.type.replace(/_/g, ' ')}</p>
                      <p className="text-xs text-muted-foreground">
                        {job.processedItems ?? 0}/{job.totalItems ?? 0} items
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatRelativeTime(job.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

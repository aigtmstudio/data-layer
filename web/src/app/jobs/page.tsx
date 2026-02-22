'use client';

import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { useJobs, useCancelJob } from '@/lib/hooks/use-jobs';
import { DataTable } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
import { formatDate, formatRelativeTime, getJobStatusColor } from '@/lib/utils';
import { Ban } from 'lucide-react';
import { toast } from 'sonner';
import type { ColumnDef } from '@tanstack/react-table';
import type { Job } from '@/lib/types';

export default function JobsPage() {
  const { selectedClientId } = useAppStore();
  const [statusFilter, setStatusFilter] = useState('all');
  const cancelJob = useCancelJob();
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  const { data: jobs, isLoading } = useJobs({
    clientId: selectedClientId ?? undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
  });

  const handleCancel = async (id: string) => {
    try {
      await cancelJob.mutateAsync(id);
      toast.success('Job cancelled');
    } catch {
      toast.error('Failed to cancel job');
    }
  };

  const columns: ColumnDef<Job>[] = [
    {
      accessorKey: 'type',
      header: 'Type',
      cell: ({ row }) => (
        <span className="font-medium">{row.original.type.replace(/_/g, ' ')}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge className={getJobStatusColor(row.original.status)} variant="outline">
          {row.original.status}
        </Badge>
      ),
    },
    {
      id: 'progress',
      header: 'Progress',
      cell: ({ row }) => {
        const total = row.original.totalItems ?? 0;
        const processed = row.original.processedItems ?? 0;
        const pct = total > 0 ? (processed / total) * 100 : 0;
        return (
          <div className="flex items-center gap-2">
            <Progress value={pct} className="w-20" />
            <span className="text-xs text-muted-foreground">
              {processed}/{total}
            </span>
          </div>
        );
      },
    },
    {
      id: 'failed',
      header: 'Failed',
      cell: ({ row }) => (
        <span className={row.original.failedItems ? 'text-destructive' : 'text-muted-foreground'}>
          {row.original.failedItems ?? 0}
        </span>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      cell: ({ row }) => formatRelativeTime(row.original.createdAt),
    },
    {
      id: 'duration',
      header: 'Duration',
      cell: ({ row }) => {
        if (!row.original.startedAt) return '-';
        const end = row.original.completedAt || new Date().toISOString();
        const ms = new Date(end).getTime() - new Date(row.original.startedAt).getTime();
        const secs = Math.floor(ms / 1000);
        if (secs < 60) return `${secs}s`;
        const mins = Math.floor(secs / 60);
        return `${mins}m ${secs % 60}s`;
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const canCancel = row.original.status === 'pending' || row.original.status === 'running';
        return (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedJob(row.original);
              }}
            >
              Details
            </Button>
            {canCancel && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCancel(row.original.id);
                }}
                disabled={cancelJob.isPending}
              >
                <Ban className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Jobs</h1>
          <p className="text-muted-foreground">Monitor enrichment, build, and export jobs</p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="running">Running</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">Loading...</div>
      ) : (
        <DataTable columns={columns} data={jobs ?? []} />
      )}

      {/* Job Detail Dialog */}
      <Dialog open={!!selectedJob} onOpenChange={(open) => !open && setSelectedJob(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Job Details</DialogTitle>
          </DialogHeader>
          {selectedJob && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Type</p>
                  <p className="font-medium">{selectedJob.type.replace(/_/g, ' ')}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge className={getJobStatusColor(selectedJob.status)} variant="outline">
                    {selectedJob.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Created</p>
                  <p className="text-sm">{formatDate(selectedJob.createdAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Completed</p>
                  <p className="text-sm">{selectedJob.completedAt ? formatDate(selectedJob.completedAt) : '-'}</p>
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground">Progress</p>
                <p className="text-sm">
                  {selectedJob.processedItems ?? 0} / {selectedJob.totalItems ?? 0} processed,{' '}
                  {selectedJob.failedItems ?? 0} failed
                </p>
              </div>

              {selectedJob.input && Object.keys(selectedJob.input).length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground">Input</p>
                  <Card>
                    <CardContent className="p-3">
                      <pre className="max-h-32 overflow-auto text-xs">
                        {JSON.stringify(selectedJob.input, null, 2)}
                      </pre>
                    </CardContent>
                  </Card>
                </div>
              )}

              {selectedJob.errors && selectedJob.errors.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground">Errors ({selectedJob.errors.length})</p>
                  <Card>
                    <CardContent className="p-3">
                      <pre className="max-h-32 overflow-auto text-xs text-destructive">
                        {JSON.stringify(selectedJob.errors, null, 2)}
                      </pre>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useList, useListMembers, useRefreshList, useUpdateListSchedule } from '@/lib/hooks/use-lists';
import { useAppStore } from '@/lib/store';
import { useTriggerExport } from '@/lib/hooks/use-exports';
import { DataTable } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatDate, formatRelativeTime, formatNumber } from '@/lib/utils';
import { ArrowLeft, RefreshCw, Download, Clock } from 'lucide-react';
import { toast } from 'sonner';
import type { ColumnDef } from '@tanstack/react-table';
import type { ListMember } from '@/lib/types';

const memberColumns: ColumnDef<ListMember>[] = [
  {
    id: 'name',
    header: 'Name',
    cell: ({ row }) => {
      if (row.original.contact) {
        return `${row.original.contact.firstName ?? ''} ${row.original.contact.lastName ?? ''}`.trim() || '-';
      }
      return row.original.company?.name ?? '-';
    },
  },
  {
    id: 'domain',
    header: 'Domain',
    cell: ({ row }) => row.original.company?.domain ?? '-',
  },
  {
    id: 'title',
    header: 'Title',
    cell: ({ row }) => row.original.contact?.title ?? '-',
  },
  {
    accessorKey: 'icpFitScore',
    header: 'ICP Fit',
    cell: ({ row }) =>
      row.original.icpFitScore
        ? `${(parseFloat(row.original.icpFitScore) * 100).toFixed(0)}%`
        : '-',
  },
  {
    accessorKey: 'addedAt',
    header: 'Added',
    cell: ({ row }) => formatRelativeTime(row.original.addedAt),
  },
];

export default function ListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { selectedClientId } = useAppStore();
  const { data: list, isLoading } = useList(id);
  const { data: members } = useListMembers(id);
  const refreshList = useRefreshList();
  const triggerExport = useTriggerExport();
  const updateSchedule = useUpdateListSchedule();

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [refreshEnabled, setRefreshEnabled] = useState(false);
  const [refreshCron, setRefreshCron] = useState('');

  if (isLoading || !list) {
    return <div className="flex items-center justify-center py-12">Loading...</div>;
  }

  const handleRefresh = async () => {
    try {
      await refreshList.mutateAsync(id);
      toast.success('Refresh started');
    } catch {
      toast.error('Failed to refresh');
    }
  };

  const handleExport = async () => {
    if (!selectedClientId) return;
    try {
      await triggerExport.mutateAsync({
        clientId: selectedClientId,
        listId: id,
        format: 'csv',
      });
      toast.success('Export started');
    } catch {
      toast.error('Failed to export');
    }
  };

  const handleSaveSchedule = async () => {
    try {
      await updateSchedule.mutateAsync({
        id,
        data: {
          refreshEnabled,
          refreshCron: refreshEnabled ? refreshCron : undefined,
        },
      });
      setScheduleOpen(false);
      toast.success('Schedule updated');
    } catch {
      toast.error('Failed to update schedule');
    }
  };

  const openScheduleDialog = () => {
    setRefreshEnabled(list.refreshEnabled);
    setRefreshCron(list.refreshCron || '0 9 * * 1');
    setScheduleOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/lists">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{list.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline">{list.type}</Badge>
            {list.refreshEnabled && <Badge variant="secondary">Auto-refresh</Badge>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openScheduleDialog}>
            <Clock className="mr-2 h-4 w-4" />
            Schedule
          </Button>
          <Button variant="outline" onClick={handleRefresh} disabled={refreshList.isPending}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Members</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatNumber(list.memberCount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Companies</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatNumber(list.companyCount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Contacts</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatNumber(list.contactCount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Last Refreshed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-medium">{formatRelativeTime(list.lastRefreshedAt)}</p>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold">Members</h2>
        <DataTable columns={memberColumns} data={members ?? []} />
      </div>

      {/* Schedule Dialog */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Refresh Schedule</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Auto-refresh</Label>
              <Switch checked={refreshEnabled} onCheckedChange={setRefreshEnabled} />
            </div>
            {refreshEnabled && (
              <div className="space-y-2">
                <Label>Cron Expression</Label>
                <Input
                  value={refreshCron}
                  onChange={(e) => setRefreshCron(e.target.value)}
                  placeholder="0 9 * * 1"
                />
                <p className="text-xs text-muted-foreground">
                  Format: minute hour day month weekday. Example: &quot;0 9 * * 1&quot; = Every Monday at 9am
                </p>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setScheduleOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveSchedule} disabled={updateSchedule.isPending}>
                {updateSchedule.isPending ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

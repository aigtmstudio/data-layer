'use client';

import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { usePersonasV2, useCreatePersonaV2, useDeletePersonaV2 } from '@/lib/hooks/use-personas-v2';
import { useIcps } from '@/lib/hooks/use-icps';
import { DataTable } from '@/components/shared/data-table';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { formatDate } from '@/lib/utils';
import { Plus, UserCircle, MoreHorizontal, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ErrorBanner } from '@/components/shared/error-banner';
import type { ColumnDef } from '@tanstack/react-table';
import type { Persona } from '@/lib/types';

export default function PersonasPage() {
  const { selectedClientId } = useAppStore();
  const { data: personas, isLoading, isError } = usePersonasV2(selectedClientId);
  const { data: icps } = useIcps(selectedClientId);
  const createPersona = useCreatePersonaV2();
  const deletePersona = useDeletePersonaV2();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newIcpId, setNewIcpId] = useState('');
  const [newTitles, setNewTitles] = useState('');
  const [newSeniority, setNewSeniority] = useState('');
  const [newDepartments, setNewDepartments] = useState('');

  if (!selectedClientId) {
    return (
      <EmptyState
        icon={UserCircle}
        title="No client selected"
        description="Select a client from the header to view personas."
      />
    );
  }

  if (isError) {
    return <ErrorBanner description="Failed to load personas." />;
  }

  const icpMap = new Map((icps ?? []).map(i => [i.id, i.name]));

  const columns: ColumnDef<Persona>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm truncate max-w-[250px] block">
          {row.original.description || '-'}
        </span>
      ),
    },
    {
      id: 'icp',
      header: 'ICP',
      cell: ({ row }) => (
        <Badge variant="outline">{icpMap.get(row.original.icpId) ?? 'Unknown'}</Badge>
      ),
    },
    {
      id: 'titles',
      header: 'Title Patterns',
      cell: ({ row }) => {
        const titles = row.original.titlePatterns ?? [];
        if (!titles.length) return <span className="text-muted-foreground">-</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {titles.slice(0, 3).map(t => (
              <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
            ))}
            {titles.length > 3 && <Badge variant="secondary" className="text-xs">+{titles.length - 3}</Badge>}
          </div>
        );
      },
    },
    {
      id: 'seniority',
      header: 'Seniority',
      cell: ({ row }) => {
        const levels = row.original.seniorityLevels ?? [];
        return levels.length ? levels.join(', ') : <span className="text-muted-foreground">-</span>;
      },
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      cell: ({ row }) => formatDate(row.original.createdAt),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm"><MoreHorizontal className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="text-destructive"
              onClick={async () => {
                try {
                  await deletePersona.mutateAsync(row.original.id);
                  toast.success('Persona deleted');
                } catch {
                  toast.error('Failed to delete persona');
                }
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const handleCreate = async () => {
    if (!newName.trim() || !newIcpId || !selectedClientId) return;
    try {
      await createPersona.mutateAsync({
        clientId: selectedClientId,
        icpId: newIcpId,
        name: newName.trim(),
        description: newDescription.trim() || undefined,
        titlePatterns: newTitles ? newTitles.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        seniorityLevels: newSeniority ? newSeniority.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        departments: newDepartments ? newDepartments.split(',').map(s => s.trim()).filter(Boolean) : undefined,
      });
      setDialogOpen(false);
      setNewName('');
      setNewDescription('');
      setNewIcpId('');
      setNewTitles('');
      setNewSeniority('');
      setNewDepartments('');
      toast.success('Persona created');
    } catch {
      toast.error('Failed to create persona');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Personas</h1>
          <p className="text-muted-foreground">Define your target buyer profiles for each ICP</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} disabled={!icps?.length}>
          <Plus className="mr-2 h-4 w-4" />
          Create Persona
        </Button>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading...</div>
      ) : !personas?.length ? (
        <EmptyState
          icon={UserCircle}
          title="No personas yet"
          description={icps?.length ? 'Create a persona to define your target buyer profile.' : 'Create an ICP first, then add personas.'}
          action={
            icps?.length ? (
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Persona
              </Button>
            ) : undefined
          }
        />
      ) : (
        <DataTable columns={columns} data={personas} />
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Persona</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>ICP</Label>
              <Select value={newIcpId} onValueChange={setNewIcpId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an ICP" />
                </SelectTrigger>
                <SelectContent>
                  {(icps ?? []).map(icp => (
                    <SelectItem key={icp.id} value={icp.id}>{icp.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. VP of Engineering"
              />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="What makes this persona a good target?"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Title Patterns</Label>
              <Input
                value={newTitles}
                onChange={(e) => setNewTitles(e.target.value)}
                placeholder="VP Engineering, CTO, Head of Platform"
              />
              <p className="text-xs text-muted-foreground">Comma-separated job title patterns to match</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Seniority Levels</Label>
                <Input
                  value={newSeniority}
                  onChange={(e) => setNewSeniority(e.target.value)}
                  placeholder="VP, Director, C-Suite"
                />
              </div>
              <div className="space-y-2">
                <Label>Departments</Label>
                <Input
                  value={newDepartments}
                  onChange={(e) => setNewDepartments(e.target.value)}
                  placeholder="Engineering, Product"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!newName.trim() || !newIcpId || createPersona.isPending}>
                {createPersona.isPending ? 'Creating...' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

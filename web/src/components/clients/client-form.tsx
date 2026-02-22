'use client';

import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const clientSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  slug: z.string().min(1, 'Slug is required').regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers, hyphens only'),
  industry: z.string().optional(),
  website: z.string().url().optional().or(z.literal('')),
  notes: z.string().optional(),
  creditMarginPercent: z.string().optional(),
});

type ClientFormValues = z.infer<typeof clientSchema>;

interface ClientFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: ClientFormValues) => void;
  loading?: boolean;
  defaultValues?: Partial<ClientFormValues>;
  mode?: 'create' | 'edit';
}

export function ClientForm({
  open,
  onOpenChange,
  onSubmit,
  loading,
  defaultValues,
  mode = 'create',
}: ClientFormProps) {
  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: '',
      slug: '',
      industry: '',
      website: '',
      notes: '',
      creditMarginPercent: '30',
      ...defaultValues,
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Add Client' : 'Edit Client'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...form.register('name')} placeholder="Acme Corp" />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          {mode === 'create' && (
            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input id="slug" {...form.register('slug')} placeholder="acme-corp" />
              {form.formState.errors.slug && (
                <p className="text-xs text-destructive">{form.formState.errors.slug.message}</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="industry">Industry</Label>
            <Input id="industry" {...form.register('industry')} placeholder="SaaS" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <Input id="website" {...form.register('website')} placeholder="https://example.com" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="creditMarginPercent">Credit Margin %</Label>
            <Input
              id="creditMarginPercent"
              type="number"
              {...form.register('creditMarginPercent')}
              placeholder="30"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" {...form.register('notes')} placeholder="Internal notes..." rows={3} />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : mode === 'create' ? 'Add Client' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

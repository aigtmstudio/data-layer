'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { useTriggerEnrichment } from '@/lib/hooks/use-enrichment';
import { useIcps } from '@/lib/hooks/use-icps';
import { useJobs } from '@/lib/hooks/use-jobs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/shared/empty-state';
import { formatRelativeTime, getJobStatusColor } from '@/lib/utils';
import { Zap, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function EnrichmentPage() {
  const router = useRouter();
  const { selectedClientId } = useAppStore();
  const { data: icps } = useIcps(selectedClientId);
  const triggerEnrichment = useTriggerEnrichment();
  const { data: recentJobs } = useJobs({
    clientId: selectedClientId ?? undefined,
    limit: 10,
  });

  const [domains, setDomains] = useState('');
  const [icpId, setIcpId] = useState('');
  const [skipContacts, setSkipContacts] = useState(false);
  const [skipEmailVerification, setSkipEmailVerification] = useState(false);

  if (!selectedClientId) {
    return (
      <EmptyState
        icon={Zap}
        title="No client selected"
        description="Select a client from the header to start enrichment."
      />
    );
  }

  const domainList = domains
    .split('\n')
    .map((d) => d.trim())
    .filter(Boolean);

  const handleSubmit = async () => {
    if (domainList.length === 0) {
      toast.error('Enter at least one domain');
      return;
    }
    try {
      await triggerEnrichment.mutateAsync({
        clientId: selectedClientId,
        domains: domainList,
        icpId: icpId || undefined,
        options: {
          skipContacts: skipContacts || undefined,
          skipEmailVerification: skipEmailVerification || undefined,
        },
      });
      toast.success('Enrichment started');
      setDomains('');
      router.push('/jobs');
    } catch {
      toast.error('Failed to start enrichment');
    }
  };

  const enrichmentJobs = recentJobs?.filter(
    (j) => j.type === 'company_enrichment' || j.type === 'full_enrichment_pipeline',
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Enrichment</h1>
        <p className="text-muted-foreground">Enrich companies and contacts from domain lists</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Start Enrichment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Domains (one per line)</Label>
              <Textarea
                value={domains}
                onChange={(e) => setDomains(e.target.value)}
                placeholder={"stripe.com\nfigma.com\nlinear.app\nnotion.so"}
                rows={10}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                {domainList.length} domain{domainList.length !== 1 ? 's' : ''} entered
              </p>
            </div>

            <div className="space-y-2">
              <Label>ICP for scoring (optional)</Label>
              <Select value={icpId} onValueChange={setIcpId}>
                <SelectTrigger>
                  <SelectValue placeholder="No ICP scoring" />
                </SelectTrigger>
                <SelectContent>
                  {icps?.map((icp) => (
                    <SelectItem key={icp.id} value={icp.id}>
                      {icp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="skip-contacts"
                  checked={skipContacts}
                  onCheckedChange={(v) => setSkipContacts(v === true)}
                />
                <Label htmlFor="skip-contacts" className="text-sm font-normal">
                  Skip contact discovery (company enrichment only)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="skip-verification"
                  checked={skipEmailVerification}
                  onCheckedChange={(v) => setSkipEmailVerification(v === true)}
                />
                <Label htmlFor="skip-verification" className="text-sm font-normal">
                  Skip email verification
                </Label>
              </div>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={triggerEnrichment.isPending || domainList.length === 0}
              className="w-full"
            >
              {triggerEnrichment.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Zap className="mr-2 h-4 w-4" />
                  Start Enrichment ({domainList.length} domains)
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Enrichments</CardTitle>
          </CardHeader>
          <CardContent>
            {!enrichmentJobs?.length ? (
              <p className="text-sm text-muted-foreground">No recent enrichment jobs</p>
            ) : (
              <div className="space-y-3">
                {enrichmentJobs.map((job) => (
                  <div key={job.id} className="flex items-center justify-between rounded border p-2">
                    <div>
                      <Badge className={getJobStatusColor(job.status)} variant="outline">
                        {job.status}
                      </Badge>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {job.processedItems ?? 0}/{job.totalItems ?? 0} items
                      </p>
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
    </div>
  );
}

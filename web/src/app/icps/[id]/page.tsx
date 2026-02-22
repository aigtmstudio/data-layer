'use client';

import { use, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useIcp, useUpdateIcp, useParseIcp } from '@/lib/hooks/use-icps';
import { usePersonas, useCreatePersona } from '@/lib/hooks/use-personas';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { TagInput } from '@/components/shared/tag-input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, Sparkles, Plus, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ErrorBanner } from '@/components/shared/error-banner';
import type { IcpFilters } from '@/lib/types';

export default function IcpBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: icpId } = use(params);
  const searchParams = useSearchParams();
  const clientId = searchParams.get('clientId');

  const { data: icp, isLoading, isError, refetch } = useIcp(clientId, icpId);
  const { data: personas } = usePersonas(clientId, icpId);
  const updateIcp = useUpdateIcp();
  const parseIcp = useParseIcp();
  const createPersona = useCreatePersona();

  const [nlInput, setNlInput] = useState('');
  const [filters, setFilters] = useState<IcpFilters>({});
  const [initialized, setInitialized] = useState(false);

  const [newPersonaOpen, setNewPersonaOpen] = useState(false);
  const [personaName, setPersonaName] = useState('');
  const [personaTitles, setPersonaTitles] = useState<string[]>([]);
  const [personaSeniority, setPersonaSeniority] = useState<string[]>([]);
  const [personaDepts, setPersonaDepts] = useState<string[]>([]);

  // Initialize form state from loaded ICP
  if (icp && !initialized) {
    setNlInput(icp.naturalLanguageInput || '');
    setFilters(icp.filters || {});
    setInitialized(true);
  }

  if (isLoading || !clientId) {
    return <div className="flex items-center justify-center py-12">Loading...</div>;
  }

  if (isError || !icp) {
    return <ErrorBanner title="ICP not found" description="Could not load ICP data. The API may be unavailable." retry={() => refetch()} />;
  }

  const handleParse = async () => {
    if (!nlInput.trim()) return;
    try {
      // Save NL input first
      await updateIcp.mutateAsync({
        clientId,
        icpId,
        data: { naturalLanguageInput: nlInput },
      });
      // Then trigger AI parse
      const result = await parseIcp.mutateAsync({ clientId, icpId });
      setFilters(result.filters);
      toast.success('ICP parsed successfully');
    } catch {
      toast.error('Failed to parse ICP');
    }
  };

  const handleSaveFilters = async () => {
    try {
      await updateIcp.mutateAsync({
        clientId,
        icpId,
        data: { filters, naturalLanguageInput: nlInput },
      });
      toast.success('ICP saved');
    } catch {
      toast.error('Failed to save ICP');
    }
  };

  const handleCreatePersona = async () => {
    if (!personaName.trim()) return;
    try {
      await createPersona.mutateAsync({
        clientId,
        icpId,
        data: {
          name: personaName,
          titlePatterns: personaTitles,
          seniorityLevels: personaSeniority,
          departments: personaDepts,
        },
      });
      setNewPersonaOpen(false);
      setPersonaName('');
      setPersonaTitles([]);
      setPersonaSeniority([]);
      setPersonaDepts([]);
      toast.success('Persona created');
    } catch {
      toast.error('Failed to create persona');
    }
  };

  const updateFilter = <K extends keyof IcpFilters>(key: K, value: IcpFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/clients/${clientId}`}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{icp.name}</h1>
          {icp.aiParsingConfidence && (
            <Badge variant="outline" className="mt-1">
              AI Confidence: {(parseFloat(icp.aiParsingConfidence) * 100).toFixed(0)}%
            </Badge>
          )}
        </div>
        <Button onClick={handleSaveFilters} disabled={updateIcp.isPending}>
          <Save className="mr-2 h-4 w-4" />
          {updateIcp.isPending ? 'Saving...' : 'Save'}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Natural Language */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4" />
              Natural Language Description
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={nlInput}
              onChange={(e) => setNlInput(e.target.value)}
              placeholder="Describe your ideal customer profile in plain English. For example: Mid-market B2B SaaS companies with 50-500 employees in the US, Series A to C funded, using modern tech stacks like React, AWS..."
              rows={8}
            />
            <Button onClick={handleParse} disabled={parseIcp.isPending || !nlInput.trim()} className="w-full">
              {parseIcp.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Parsing...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Parse with AI
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Right: Structured Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Structured Filters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Industries</Label>
              <TagInput
                value={filters.industries || []}
                onChange={(v) => updateFilter('industries', v)}
                placeholder="e.g. SaaS, FinTech, HealthTech"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Employees Min</Label>
                <Input
                  type="number"
                  value={filters.employeeCountMin ?? ''}
                  onChange={(e) => updateFilter('employeeCountMin', e.target.value ? parseInt(e.target.value) : undefined)}
                  placeholder="50"
                />
              </div>
              <div className="space-y-2">
                <Label>Employees Max</Label>
                <Input
                  type="number"
                  value={filters.employeeCountMax ?? ''}
                  onChange={(e) => updateFilter('employeeCountMax', e.target.value ? parseInt(e.target.value) : undefined)}
                  placeholder="500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Revenue Min ($)</Label>
                <Input
                  type="number"
                  value={filters.revenueMin ?? ''}
                  onChange={(e) => updateFilter('revenueMin', e.target.value ? parseInt(e.target.value) : undefined)}
                  placeholder="1000000"
                />
              </div>
              <div className="space-y-2">
                <Label>Revenue Max ($)</Label>
                <Input
                  type="number"
                  value={filters.revenueMax ?? ''}
                  onChange={(e) => updateFilter('revenueMax', e.target.value ? parseInt(e.target.value) : undefined)}
                  placeholder="50000000"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Countries</Label>
              <TagInput
                value={filters.countries || []}
                onChange={(v) => updateFilter('countries', v)}
                placeholder="e.g. US, UK, Canada"
              />
            </div>

            <div className="space-y-2">
              <Label>Funding Stages</Label>
              <TagInput
                value={filters.fundingStages || []}
                onChange={(v) => updateFilter('fundingStages', v)}
                placeholder="e.g. Series A, Series B"
              />
            </div>

            <div className="space-y-2">
              <Label>Tech Stack</Label>
              <TagInput
                value={filters.techStack || []}
                onChange={(v) => updateFilter('techStack', v)}
                placeholder="e.g. React, AWS, Python"
              />
            </div>

            <div className="space-y-2">
              <Label>Keywords</Label>
              <TagInput
                value={filters.keywords || []}
                onChange={(v) => updateFilter('keywords', v)}
                placeholder="e.g. AI, machine learning"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Personas Section */}
      <Separator />
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Personas</h2>
          <Button variant="outline" onClick={() => setNewPersonaOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Persona
          </Button>
        </div>

        {!personas?.length ? (
          <p className="text-sm text-muted-foreground">No personas defined yet.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {personas.map((persona) => (
              <Card key={persona.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{persona.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {persona.titlePatterns.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground">Titles</p>
                      <div className="flex flex-wrap gap-1">
                        {persona.titlePatterns.map((t) => (
                          <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {persona.seniorityLevels.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground">Seniority</p>
                      <div className="flex flex-wrap gap-1">
                        {persona.seniorityLevels.map((s) => (
                          <Badge key={s} variant="outline" className="text-xs">{s}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {persona.departments.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground">Departments</p>
                      <div className="flex flex-wrap gap-1">
                        {persona.departments.map((d) => (
                          <Badge key={d} variant="outline" className="text-xs">{d}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* New Persona Dialog */}
      <Dialog open={newPersonaOpen} onOpenChange={setNewPersonaOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Persona</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={personaName}
                onChange={(e) => setPersonaName(e.target.value)}
                placeholder="VP of Engineering"
              />
            </div>
            <div className="space-y-2">
              <Label>Title Patterns</Label>
              <TagInput
                value={personaTitles}
                onChange={setPersonaTitles}
                placeholder="e.g. VP of Engineering, CTO, Director of Tech"
              />
            </div>
            <div className="space-y-2">
              <Label>Seniority Levels</Label>
              <TagInput
                value={personaSeniority}
                onChange={setPersonaSeniority}
                placeholder="e.g. VP, Director, C-Suite"
              />
            </div>
            <div className="space-y-2">
              <Label>Departments</Label>
              <TagInput
                value={personaDepts}
                onChange={setPersonaDepts}
                placeholder="e.g. Engineering, Product"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setNewPersonaOpen(false)}>Cancel</Button>
              <Button onClick={handleCreatePersona} disabled={createPersona.isPending}>
                {createPersona.isPending ? 'Creating...' : 'Create Persona'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

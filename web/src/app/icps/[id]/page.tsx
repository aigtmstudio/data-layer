'use client';

import { use, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useIcp, useUpdateIcp, useParseIcp, useSources, useUploadDocument, useAddTranscript, useUploadCrmCsv, useClearSources, useParseSources } from '@/lib/hooks/use-icps';
import { usePersonas, useCreatePersona, useDeletePersona } from '@/lib/hooks/use-personas';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TagInput } from '@/components/shared/tag-input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, Sparkles, Plus, Save, Loader2, Upload, FileText, MessageSquare, Table2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ErrorBanner } from '@/components/shared/error-banner';
import type { IcpFilters } from '@/lib/types';

export default function IcpBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: icpId } = use(params);
  const searchParams = useSearchParams();
  const clientId = searchParams.get('clientId');

  const { data: icp, isLoading, isError, refetch } = useIcp(clientId, icpId);
  const { data: personas } = usePersonas(clientId, icpId);
  const { data: pendingSources, refetch: refetchSources } = useSources(clientId, icpId);
  const updateIcp = useUpdateIcp();
  const parseIcp = useParseIcp();
  const createPersona = useCreatePersona();
  const deletePersona = useDeletePersona();
  const uploadDocument = useUploadDocument();
  const addTranscript = useAddTranscript();
  const uploadCrmCsv = useUploadCrmCsv();
  const clearSources = useClearSources();
  const parseSources = useParseSources();

  const [nlInput, setNlInput] = useState('');
  const [filters, setFilters] = useState<IcpFilters>({});
  const [initialized, setInitialized] = useState(false);

  const [newPersonaOpen, setNewPersonaOpen] = useState(false);
  const [personaName, setPersonaName] = useState('');
  const [personaTitles, setPersonaTitles] = useState<string[]>([]);
  const [personaSeniority, setPersonaSeniority] = useState<string[]>([]);
  const [personaDepts, setPersonaDepts] = useState<string[]>([]);

  const [transcriptText, setTranscriptText] = useState('');
  const docInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

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
      await updateIcp.mutateAsync({
        clientId,
        icpId,
        data: { naturalLanguageInput: nlInput },
      });
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

  const handleDeletePersona = async (personaId: string) => {
    try {
      await deletePersona.mutateAsync({ clientId, icpId, personaId });
      toast.success('Persona deleted');
    } catch {
      toast.error('Failed to delete persona');
    }
  };

  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await uploadDocument.mutateAsync({ clientId, icpId, file });
      toast.success(`Document uploaded (${result.pendingSources} source${result.pendingSources > 1 ? 's' : ''} pending)`);
      refetchSources();
    } catch {
      toast.error('Failed to upload document');
    }
    if (docInputRef.current) docInputRef.current.value = '';
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await uploadCrmCsv.mutateAsync({ clientId, icpId, file });
      toast.success(`CRM CSV uploaded (${result.pendingSources} source${result.pendingSources > 1 ? 's' : ''} pending)`);
      refetchSources();
    } catch {
      toast.error('Failed to upload CSV');
    }
    if (csvInputRef.current) csvInputRef.current.value = '';
  };

  const handleAddTranscript = async () => {
    if (!transcriptText.trim()) return;
    try {
      const result = await addTranscript.mutateAsync({ clientId, icpId, text: transcriptText });
      setTranscriptText('');
      toast.success(`Transcript added (${result.pendingSources} source${result.pendingSources > 1 ? 's' : ''} pending)`);
      refetchSources();
    } catch {
      toast.error('Failed to add transcript');
    }
  };

  const handleClearSources = async () => {
    try {
      await clearSources.mutateAsync({ clientId, icpId });
      toast.success('Sources cleared');
    } catch {
      toast.error('Failed to clear sources');
    }
  };

  const handleParseSources = async () => {
    try {
      const result = await parseSources.mutateAsync({
        clientId,
        icpId,
        opts: { generatePersona: true },
      });
      setFilters(result.icp.filters);
      toast.success(`Sources parsed successfully (confidence: ${(result.confidence * 100).toFixed(0)}%)`);
    } catch {
      toast.error('Failed to parse sources');
    }
  };

  const updateFilter = <K extends keyof IcpFilters>(key: K, value: IcpFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const sourceCount = pendingSources?.length ?? 0;

  const sourceTypeLabel = (type: string) => {
    switch (type) {
      case 'document': return 'Document';
      case 'transcript': return 'Transcript';
      case 'classic': return 'Selectors';
      case 'crm_csv': return 'CRM CSV';
      default: return type;
    }
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

      <Tabs defaultValue="sources">
        <TabsList>
          <TabsTrigger value="sources">
            Sources {sourceCount > 0 && <Badge variant="secondary" className="ml-1.5 text-xs">{sourceCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="filters">Filters</TabsTrigger>
          <TabsTrigger value="personas">
            Personas {personas && personas.length > 0 && <Badge variant="secondary" className="ml-1.5 text-xs">{personas.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* ── Sources Tab ── */}
        <TabsContent value="sources" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Document Upload */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4" />
                  Upload Document
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  PDF, DOCX, PPTX, or TXT files containing ICP-related information.
                </p>
                <input
                  ref={docInputRef}
                  type="file"
                  accept=".pdf,.docx,.pptx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain"
                  onChange={handleDocumentUpload}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => docInputRef.current?.click()}
                  disabled={uploadDocument.isPending}
                >
                  {uploadDocument.isPending ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading...</>
                  ) : (
                    <><Upload className="mr-2 h-4 w-4" />Choose File</>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Transcript Paste */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <MessageSquare className="h-4 w-4" />
                  Paste Transcript
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={transcriptText}
                  onChange={(e) => setTranscriptText(e.target.value)}
                  placeholder="Paste a sales call or meeting transcript..."
                  rows={4}
                />
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleAddTranscript}
                  disabled={addTranscript.isPending || !transcriptText.trim()}
                >
                  {addTranscript.isPending ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Adding...</>
                  ) : (
                    <><Plus className="mr-2 h-4 w-4" />Add Transcript</>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* CRM CSV Upload */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Table2 className="h-4 w-4" />
                  Upload CRM CSV
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Export from your CRM with columns like company, industry, employee count, deal size, etc.
                </p>
                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleCsvUpload}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => csvInputRef.current?.click()}
                  disabled={uploadCrmCsv.isPending}
                >
                  {uploadCrmCsv.isPending ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading...</>
                  ) : (
                    <><Upload className="mr-2 h-4 w-4" />Choose CSV</>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Pending Sources */}
          {sourceCount > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    Pending Sources ({sourceCount})
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearSources}
                    disabled={clearSources.isPending}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    Clear All
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {pendingSources?.map((source, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-md border p-3">
                      <Badge variant="outline" className="mt-0.5 shrink-0">
                        {sourceTypeLabel(source.sourceType)}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        {source.textPreview && (
                          <p className="text-sm text-muted-foreground line-clamp-2">{source.textPreview}</p>
                        )}
                        <div className="mt-1 flex gap-2 text-xs text-muted-foreground">
                          {source.hasStructuredData && <span>Has structured data</span>}
                          {source.hasCrmInsights && <span>Has CRM insights</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Parse Action */}
          <div className="flex justify-end">
            <Button
              size="lg"
              onClick={handleParseSources}
              disabled={parseSources.isPending || sourceCount === 0}
            >
              {parseSources.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Parsing Sources...</>
              ) : (
                <><Sparkles className="mr-2 h-4 w-4" />Parse All Sources with AI</>
              )}
            </Button>
          </div>
        </TabsContent>

        {/* ── Filters Tab ── */}
        <TabsContent value="filters" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Natural Language */}
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
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Parsing...</>
                  ) : (
                    <><Sparkles className="mr-2 h-4 w-4" />Parse with AI</>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Structured Filters */}
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
        </TabsContent>

        {/* ── Personas Tab ── */}
        <TabsContent value="personas" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Personas</h2>
            <Button variant="outline" onClick={() => setNewPersonaOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Persona
            </Button>
          </div>

          {!personas?.length ? (
            <p className="text-sm text-muted-foreground">No personas defined yet. Add sources and parse them to auto-generate personas, or create one manually.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {personas.map((persona) => (
                <Card key={persona.id}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-base">{persona.name}</CardTitle>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDeletePersona(persona.id)}
                      disabled={deletePersona.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
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
        </TabsContent>
      </Tabs>

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

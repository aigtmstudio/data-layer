import { Badge } from '@/components/ui/badge';
import type { PipelineStage } from '@/lib/types';

const stageConfig: Record<PipelineStage, { label: string; className: string }> = {
  tam: { label: 'TAM', className: 'bg-gray-100 text-gray-700 hover:bg-gray-100' },
  active_segment: { label: 'Active', className: 'bg-blue-100 text-blue-700 hover:bg-blue-100' },
  qualified: { label: 'Qualified', className: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-100' },
  ready_to_approach: { label: 'Ready', className: 'bg-orange-100 text-orange-700 hover:bg-orange-100' },
  in_sequence: { label: 'In Sequence', className: 'bg-purple-100 text-purple-700 hover:bg-purple-100' },
  converted: { label: 'Converted', className: 'bg-green-100 text-green-700 hover:bg-green-100' },
};

export function PipelineBadge({ stage }: { stage: PipelineStage }) {
  const config = stageConfig[stage] ?? stageConfig.tam;
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}

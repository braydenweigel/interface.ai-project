import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Undo2 } from 'lucide-react';
import { ResultView } from '@/components/ResultView';
import { replayApi, type EvidenceRunDetail, type EvidenceRunSummary } from '@/lib/api';

interface EvidenceDetailProps {
  entry: EvidenceRunSummary;
  onBack: () => void;
}

export function EvidenceDetail({ entry, onBack }: EvidenceDetailProps) {
  const [detail, setDetail] = useState<EvidenceRunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    setLoading(true);
    replayApi
      .getEvidenceRun(entry.runDir)
      .then((result) => {
        if (!cancelled) setDetail(result);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entry.runDir]);

  if (loading) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" />
        Loading run…
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="flex flex-col gap-3">
        <div className="text-destructive flex items-center gap-2 text-sm">
          <AlertTriangle className="size-4" />
          Failed to load run: {error ?? 'unknown error'}
        </div>
        <button
          type="button"
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-sm"
        >
          <Undo2 className="size-3.5" />
          Back to log
        </button>
      </div>
    );
  }

  return (
    <ResultView
      capabilityId={detail.artifact?.capabilityId ?? detail.evidence.capabilityId}
      artifact={detail.artifact}
      result={detail.evidence.result}
      log={detail.evidence.log}
      screenshotDataUrl={detail.screenshotDataUrl}
      mode="history"
      onBack={onBack}
    />
  );
}

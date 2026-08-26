import { useEffect, useState } from 'react';
import { ArtifactPicker } from '@/components/ArtifactPicker';
import { EvidenceDetail } from '@/components/EvidenceDetail';
import { EvidenceList } from '@/components/EvidenceList';
import { ParameterForm } from '@/components/ParameterForm';
import { ResultView } from '@/components/ResultView';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { replayApi, type ArtifactListEntry, type EvidenceRunSummary, type RunOutcome } from '@/lib/api';

type Screen = 'picker' | 'form' | 'result';

export default function App() {
  const [activeTab, setActiveTab] = useState<'run' | 'log'>('run');

  const [screen, setScreen] = useState<Screen>('picker');
  const [artifacts, setArtifacts] = useState<ArtifactListEntry[]>([]);
  const [loadingArtifacts, setLoadingArtifacts] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selected, setSelected] = useState<ArtifactListEntry | null>(null);
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const [lastParams, setLastParams] = useState<Record<string, string | number | boolean>>({});
  const [runError, setRunError] = useState<string | null>(null);

  const [evidenceRuns, setEvidenceRuns] = useState<EvidenceRunSummary[]>([]);
  const [loadingEvidence, setLoadingEvidence] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<EvidenceRunSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    replayApi
      .listArtifacts()
      .then((entries) => {
        if (!cancelled) setArtifacts(entries);
      })
      .catch((err) => {
        if (!cancelled) setListError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingArtifacts(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-fetch every time the Log tab becomes active, not just once on first
  // mount, so a run just completed on the Run tab shows up without
  // restarting the app (build-specs/console/2_LOG_TAB_SPEC.md §3).
  useEffect(() => {
    if (activeTab !== 'log') return;
    let cancelled = false;
    setLoadingEvidence(true);
    setEvidenceError(null);
    replayApi
      .listEvidenceRuns()
      .then((entries) => {
        if (!cancelled) setEvidenceRuns(entries);
      })
      .catch((err) => {
        if (!cancelled) setEvidenceError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingEvidence(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  function handleSelect(entry: ArtifactListEntry) {
    setSelected(entry);
    setOutcome(null);
    setRunError(null);
    setScreen('form');
  }

  async function handleRun(params: Record<string, string | number | boolean>) {
    if (!selected) return;
    setRunning(true);
    setRunError(null);
    try {
      const result = await replayApi.runArtifact(selected.path, params);
      setOutcome(result);
      setLastParams(params);
      setScreen('result');
    } catch (err) {
      setRunError(String(err));
    } finally {
      setRunning(false);
    }
  }

  function backToPicker() {
    setSelected(null);
    setOutcome(null);
    setRunError(null);
    setScreen('picker');
  }

  function backToForm() {
    setOutcome(null);
    setRunError(null);
    setScreen('form');
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4">
        <h1 className="text-lg font-semibold">Capability Console</h1>
        <p className="text-muted-foreground text-sm">
          Select an artifact, fill in its parameters, and replay it.
        </p>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'run' | 'log')}>
          <TabsList>
            <TabsTrigger value="run">Run</TabsTrigger>
            <TabsTrigger value="log">Log</TabsTrigger>
          </TabsList>

          <TabsContent value="run" className="pt-6">
            {screen === 'picker' && (
              <ArtifactPicker
                entries={artifacts}
                loading={loadingArtifacts}
                error={listError}
                onSelect={handleSelect}
              />
            )}

            {screen === 'form' && selected?.data && (
              <ParameterForm
                artifact={selected.data}
                running={running}
                error={runError}
                onBack={backToPicker}
                onRun={handleRun}
              />
            )}

            {screen === 'result' && selected?.data && outcome && (
              <ResultView
                capabilityId={selected.data.capabilityId}
                artifact={selected.data}
                params={lastParams}
                result={outcome.result}
                log={outcome.log}
                screenshotDataUrl={outcome.screenshotDataUrl}
                mode="live"
                onRunAgain={backToForm}
                onChooseDifferent={backToPicker}
              />
            )}
          </TabsContent>

          <TabsContent value="log" className="pt-6">
            {selectedRun ? (
              <EvidenceDetail entry={selectedRun} onBack={() => setSelectedRun(null)} />
            ) : (
              <EvidenceList
                entries={evidenceRuns}
                loading={loadingEvidence}
                error={evidenceError}
                onSelect={setSelectedRun}
              />
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

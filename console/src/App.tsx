import { useEffect, useState } from 'react';
import { ArtifactPicker } from '@/components/ArtifactPicker';
import { ParameterForm } from '@/components/ParameterForm';
import { ResultView } from '@/components/ResultView';
import { replayApi, type ArtifactListEntry, type RunOutcome } from '@/lib/api';

type Screen = 'picker' | 'form' | 'result';

export default function App() {
  const [screen, setScreen] = useState<Screen>('picker');
  const [artifacts, setArtifacts] = useState<ArtifactListEntry[]>([]);
  const [loadingArtifacts, setLoadingArtifacts] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selected, setSelected] = useState<ArtifactListEntry | null>(null);
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

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
            artifact={selected.data}
            outcome={outcome}
            onRunAgain={backToForm}
            onChooseDifferent={backToPicker}
          />
        )}
      </main>
    </div>
  );
}

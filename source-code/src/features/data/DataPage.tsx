import { InspectorPage } from "@/features/inspector/InspectorPage";
import { Button, Card } from "@/components/ui";
import { useUi } from "@/lib/ui-store";
import { DataGate } from "@/components/DataGate";
import { CoverageCard } from "./CoverageCard";
import { DataHealth } from "./DataHealth";
import { StatementsCard } from "./StatementsCard";

/** Connected sheets, cache, statements, health, and the structure inspector. */
export function DataPage() {
  const demo = useUi((s) => s.demo);
  const setDemo = useUi((s) => s.setDemo);
  return (
    <div className="space-y-5">
      <DataHealth />
      <DataGate>{(ds) => <CoverageCard ds={ds} />}</DataGate>
      {!demo && (
        <StatementsCard />
      )}
      {!demo && <InspectorPage />}
      <Card title="Demo data">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-fg-2">Preview every page with generated, fictional data. Your sheets and settings are untouched.</p>
          <Button variant={demo ? "primary" : "secondary"} onClick={() => setDemo(!demo)}>
            {demo ? "Turn off demo data" : "Use demo data"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

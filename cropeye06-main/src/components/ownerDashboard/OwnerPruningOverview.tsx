import React from "react";
import { Scissors } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PruningOverview } from "../../utils/pruningOverview";
import { Card, EmptyState, SectionHeader, fmtInt } from "./ownerDashboardUi";

const FOUNDATION_COLOR = "#dc2626";
const FRUIT_COLOR = "#1d4ed8";

const plural = (n: number, word: string) => `${fmtInt(n)} ${word}${n === 1 ? "" : "s"}`;

type Props = {
  overview: PruningOverview;
  scopeLabel: string;
};

const OwnerPruningOverview: React.FC<Props> = ({ overview, scopeLabel }) => {
  const { months, pendingPlots, failedPlots } = overview;
  const notes: string[] = [];
  if (overview.missingFoundation > 0)
    notes.push(`${plural(overview.missingFoundation, "farmer")} with no foundation pruning date`);
  if (overview.missingFruit > 0) notes.push(`${plural(overview.missingFruit, "farmer")} with no fruit pruning date`);
  if (failedPlots > 0) notes.push(`schedule unavailable for ${plural(failedPlots, "plot")}`);

  return (
    <Card>
      <SectionHeader
        icon={<Scissors className="h-5 w-5" />}
        title="Pruning overview"
        subtitle={`Unique farmers by month of their saved pruning date · ${scopeLabel}`}
      />

      {overview.totalFarmers === 0 ? (
        <EmptyState message="No plots in this selection." />
      ) : months.length === 0 ? (
        <EmptyState
          loading={pendingPlots > 0}
          message={
            pendingPlots > 0
              ? `Loading pruning dates for ${plural(pendingPlots, "plot")}…`
              : "No foundation or fruit pruning dates are saved for plots in this selection."
          }
        />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 font-medium text-red-700">
              <span className="h-2 w-2 rounded-full" style={{ background: FOUNDATION_COLOR }} />
              Foundation pruning · {plural(overview.farmersWithFoundation, "farmer")}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-800">
              <span className="h-2 w-2 rounded-full" style={{ background: FRUIT_COLOR }} />
              Fruit pruning · {plural(overview.farmersWithFruit, "farmer")}
            </span>
            {pendingPlots > 0 && (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                Loading {plural(pendingPlots, "plot")}…
              </span>
            )}
          </div>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={months} margin={{ top: 4, right: 8, left: -18, bottom: 0 }} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={8} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number, name: string) => [plural(v, "farmer"), name]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="foundation" name="Foundation pruning" fill={FOUNDATION_COLOR} radius={[4, 4, 0, 0]} />
                <Bar dataKey="fruit" name="Fruit pruning" fill={FRUIT_COLOR} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {notes.length > 0 && <p className="mt-2 text-xs text-slate-500">Not counted: {notes.join(" · ")}.</p>}
        </>
      )}
    </Card>
  );
};

export default OwnerPruningOverview;

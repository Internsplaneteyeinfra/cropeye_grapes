import { useEffect, useMemo, useRef, useState } from "react";
import { useAppContext } from "../context/AppContext";
import { useFarmerProfile } from "./useFarmerProfile";
import {
  fetchGrapesScheduleRows,
  type GrapesScheduleRow,
} from "../utils/grapesSchedule";

export function useGrapesFertilizerSchedule() {
  const { profile, loading: profileLoading } = useFarmerProfile();
  const { selectedPlotName, getCached, setCached } = useAppContext();
  const [schedule, setSchedule] = useState<GrapesScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchGenRef = useRef(0);

  useEffect(() => {
    const runId = ++fetchGenRef.current;
    const isStale = () => runId !== fetchGenRef.current;

    if (profileLoading) {
      setLoading(true);
      return;
    }

    if (!profile?.plots?.length) {
      setSchedule([]);
      setError(null);
      setLoading(false);
      return;
    }

    let plotToUse = selectedPlotName;
    if (!plotToUse) {
      const firstPlot = profile.plots[0];
      plotToUse =
        firstPlot.fastapi_plot_id ||
        `${firstPlot.gat_number}_${firstPlot.plot_number}`;
    }

    if (!plotToUse) {
      setSchedule([]);
      setLoading(false);
      return;
    }

    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = await fetchGrapesScheduleRows(
          profile,
          String(plotToUse),
          getCached,
          setCached,
          isStale
        );
        if (isStale()) return;
        setSchedule(rows);
        if (rows.length === 0) {
          setError("No fertilizer schedule data for this plot.");
        }
      } catch {
        if (isStale()) return;
        setSchedule([]);
        setError("Failed to load fertilizer schedule.");
      } finally {
        if (!isStale()) setLoading(false);
      }
    })();
  }, [profile, profileLoading, selectedPlotName, getCached, setCached]);

  const scheduleByDate = useMemo(() => {
    const map = new Map<string, GrapesScheduleRow>();
    schedule.forEach((row) => {
      if (row.isoDate) map.set(row.isoDate, row);
    });
    return map;
  }, [schedule]);

  return { schedule, scheduleByDate, loading, error };
}

export type { GrapesScheduleRow };

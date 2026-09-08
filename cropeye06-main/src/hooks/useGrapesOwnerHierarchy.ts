/**
 * Lazy cascade hook for grapes-only owner hierarchy.
 * Does not call /users/owner-hierarchy/ (sugarcane/generic).
 */

import { useCallback, useEffect, useState } from "react";
import {
  displayPersonName,
  fetchGrapesOwnerFarmersByFieldOfficer,
  fetchGrapesOwnerFieldOfficers,
  fetchGrapesOwnerManagers,
  grapesOwnerHierarchyErrorMessage,
  type GrapesOwnerFarmer,
  type GrapesOwnerFarmerPlot,
  type GrapesOwnerFieldOfficer,
  type GrapesOwnerIndustry,
  type GrapesOwnerManager,
} from "../api/grapesOwnerHierarchy";

export type GrapesOwnerHierarchyState = {
  managers: GrapesOwnerManager[];
  fieldOfficers: GrapesOwnerFieldOfficer[];
  farmers: GrapesOwnerFarmer[];
  plots: GrapesOwnerFarmerPlot[];
  selectedManagerId: number | null;
  selectedFieldOfficerId: number | null;
  selectedFarmerId: number | null;
  industry: GrapesOwnerIndustry | null;
  cropType: string | null;
  loadingManagers: boolean;
  loadingFieldOfficers: boolean;
  loadingFarmers: boolean;
  error: string | null;
  forbidden: boolean;
};

const initialState: GrapesOwnerHierarchyState = {
  managers: [],
  fieldOfficers: [],
  farmers: [],
  plots: [],
  selectedManagerId: null,
  selectedFieldOfficerId: null,
  selectedFarmerId: null,
  industry: null,
  cropType: null,
  loadingManagers: false,
  loadingFieldOfficers: false,
  loadingFarmers: false,
  error: null,
  forbidden: false,
};

export function useGrapesOwnerHierarchy(enabled: boolean) {
  const [state, setState] = useState<GrapesOwnerHierarchyState>(initialState);

  const loadManagers = useCallback(async () => {
    setState((s) => ({
      ...s,
      loadingManagers: true,
      error: null,
      forbidden: false,
    }));
    try {
      const data = await fetchGrapesOwnerManagers();
      setState((s) => ({
        ...s,
        managers: data.managers,
        industry: data.industry ?? null,
        cropType: data.crop_type ?? data.industry?.crop_type ?? null,
        fieldOfficers: [],
        farmers: [],
        plots: [],
        selectedManagerId: null,
        selectedFieldOfficerId: null,
        selectedFarmerId: null,
        loadingManagers: false,
        error: null,
        forbidden: false,
      }));
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setState((s) => ({
        ...s,
        managers: [],
        loadingManagers: false,
        forbidden: status === 403,
        error: grapesOwnerHierarchyErrorMessage(err),
      }));
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setState(initialState);
      return;
    }
    void loadManagers();
  }, [enabled, loadManagers]);

  const selectManager = useCallback(async (managerId: number) => {
    setState((s) => ({
      ...s,
      selectedManagerId: managerId,
      selectedFieldOfficerId: null,
      selectedFarmerId: null,
      fieldOfficers: [],
      farmers: [],
      plots: [],
      loadingFieldOfficers: true,
      error: null,
    }));
    try {
      const data = await fetchGrapesOwnerFieldOfficers(managerId);
      const manager = data.managers[0];
      const fos = Array.isArray(manager?.field_officers)
        ? manager.field_officers
        : [];
      setState((s) => ({
        ...s,
        fieldOfficers: fos,
        loadingFieldOfficers: false,
        error: null,
      }));
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setState((s) => ({
        ...s,
        fieldOfficers: [],
        loadingFieldOfficers: false,
        forbidden: status === 403,
        error: grapesOwnerHierarchyErrorMessage(err),
      }));
    }
  }, []);

  const selectFieldOfficer = useCallback(async (fieldOfficerId: number) => {
    setState((s) => ({
      ...s,
      selectedFieldOfficerId: fieldOfficerId,
      selectedFarmerId: null,
      farmers: [],
      plots: [],
      loadingFarmers: true,
      error: null,
    }));
    try {
      const data = await fetchGrapesOwnerFarmersByFieldOfficer(fieldOfficerId);
      setState((s) => ({
        ...s,
        farmers: data.farmers,
        loadingFarmers: false,
        error: null,
      }));
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setState((s) => ({
        ...s,
        farmers: [],
        loadingFarmers: false,
        forbidden: status === 403,
        error: grapesOwnerHierarchyErrorMessage(err),
      }));
    }
  }, []);

  const selectFarmer = useCallback((farmerId: number) => {
    setState((s) => {
      const farmer = s.farmers.find((f) => f.id === farmerId);
      return {
        ...s,
        selectedFarmerId: farmerId,
        plots: Array.isArray(farmer?.plots) ? farmer!.plots! : [],
        error: null,
      };
    });
  }, []);

  return {
    ...state,
    displayPersonName,
    loadManagers,
    selectManager,
    selectFieldOfficer,
    selectFarmer,
  };
}

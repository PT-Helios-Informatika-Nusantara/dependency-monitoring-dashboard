"use server";

import { fetchActionableUpdatesOnly, fetchInventoryOnly } from "./github-data";
import type { InventoryItem, PullRequestUpdate } from "./DashboardUI";

export async function refreshActionableUpdates(): Promise<PullRequestUpdate[]> {
  return fetchActionableUpdatesOnly();
}

export async function refreshInventory(): Promise<InventoryItem[]> {
  return fetchInventoryOnly();
}

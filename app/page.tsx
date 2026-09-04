import DashboardUI from "./DashboardUI";
import { getPlatformData } from "./github-data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { inventory, prs } = await getPlatformData();

  // Pass both datasets down to your client UI
  return <DashboardUI inventory={inventory} actionablePRs={prs} />;
}

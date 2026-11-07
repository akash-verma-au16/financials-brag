import { UploadPage } from "@/features/upload/UploadPage";
import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { Shell } from "./App";
import { OverviewPage } from "@/features/overview/OverviewPage";
import { AccountsPage } from "@/features/accounts/AccountsPage";
import { DataPage } from "@/features/data/DataPage";
import { HoldingsPage } from "@/features/holdings/HoldingsPage";
import { CashFlowPage } from "@/features/cashflow/CashFlowPage";
import { SpendingPage } from "@/features/spending/SpendingPage";
import { NetWorthPage } from "@/features/networth/NetWorthPage";
import { RoomPage } from "@/features/room/RoomPage";
import { ProjectionsPage } from "@/features/projections/ProjectionsPage";
import { CalculatorsPage } from "@/features/projections/CalculatorsPage";
import { IncomePage } from "@/features/cashflow/IncomePage";
import { AllocationPage } from "@/features/holdings/AllocationPage";
import { AnalysisPage } from "@/features/holdings/AnalysisPage";
import { HoldingDetailPage } from "@/features/holdings/HoldingDetailPage";
import { SettingsPage } from "@/features/settings/SettingsPage";

const root = createRootRoute({ component: Shell });

const routes = [
  createRoute({ getParentRoute: () => root, path: "/", component: OverviewPage }),
  createRoute({ getParentRoute: () => root, path: "/accounts", component: AccountsPage }),
  createRoute({ getParentRoute: () => root, path: "/networth", component: NetWorthPage }),
  createRoute({ getParentRoute: () => root, path: "/spending", component: () => <SpendingPage scope="all" /> }),
  createRoute({ getParentRoute: () => root, path: "/spending/cards", component: () => <SpendingPage scope="cards" /> }),
  createRoute({ getParentRoute: () => root, path: "/spending/bank", component: () => <SpendingPage scope="bank" /> }),
  createRoute({ getParentRoute: () => root, path: "/cashflow", component: CashFlowPage }),
  createRoute({ getParentRoute: () => root, path: "/income", component: IncomePage }),
  createRoute({ getParentRoute: () => root, path: "/holdings", component: HoldingsPage }),
  createRoute({ getParentRoute: () => root, path: "/holdings/$key", component: HoldingDetailPage }),
  createRoute({
    getParentRoute: () => root,
    path: "/analysis",
    component: AnalysisPage,
    validateSearch: (s: Record<string, unknown>): { account?: string } => (typeof s.account === "string" ? { account: s.account } : {}),
  }),
  createRoute({ getParentRoute: () => root, path: "/allocation", component: AllocationPage }),
  createRoute({ getParentRoute: () => root, path: "/room", component: RoomPage }),
  createRoute({
    getParentRoute: () => root,
    path: "/projections",
    component: ProjectionsPage,
    validateSearch: (s: Record<string, unknown>): { focus?: string } => (typeof s.focus === "string" ? { focus: s.focus } : {}),
  }),
  createRoute({ getParentRoute: () => root, path: "/calculators", component: CalculatorsPage }),
  createRoute({ getParentRoute: () => root, path: "/upload", component: UploadPage }),
  createRoute({ getParentRoute: () => root, path: "/data", component: DataPage }),
  createRoute({ getParentRoute: () => root, path: "/settings", component: SettingsPage }),
];

export const router = createRouter({ routeTree: root.addChildren(routes), defaultPreload: "intent", basepath: import.meta.env.BASE_URL });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

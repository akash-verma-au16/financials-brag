import { useEffect, type ComponentType } from "react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { ArrowLeftRight, Calculator, ChartSpline, ChartCandlestick, CreditCard, Wallet, Building2, ChartPie, Database, Eye, FileUp, HandCoins, EyeOff, Landmark, LayoutDashboard, LogOut, Microscope, Monitor, Moon, PanelLeftClose, PanelLeftOpen, PiggyBank, Settings, Sun, TrendingUp } from "lucide-react";
import { AppDataSync } from "@/data/appDataSync";
import { signOut, useAuth } from "@/lib/google-auth";
import { DEMO_ONLY } from "@/lib/demo-only";
import { useTheme, type ThemePref } from "@/lib/theme";
import { useUi } from "@/lib/ui-store";
import { useSettings } from "@/data/settings";
import { Button, Segmented, cx } from "@/components/ui";
import { LoginScreen } from "@/features/login/LoginScreen";

type NavItem = { to: "/" | "/networth" | "/accounts" | "/spending" | "/spending/cards" | "/spending/bank" | "/cashflow" | "/holdings" | "/analysis" | "/allocation" | "/income" | "/room" | "/projections" | "/calculators" | "/upload" | "/data" | "/settings"; label: string; icon: ComponentType<{ className?: string }> };

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Money",
    items: [
      { to: "/", label: "Overview", icon: LayoutDashboard },
      { to: "/networth", label: "Net worth", icon: TrendingUp },
      { to: "/accounts", label: "Accounts", icon: Landmark },
    ],
  },
  {
    section: "Spending",
    items: [
      { to: "/spending", label: "Spending", icon: Wallet },
      { to: "/spending/cards", label: "Credit cards", icon: CreditCard },
      { to: "/spending/bank", label: "Bank accounts", icon: Building2 },
      { to: "/cashflow", label: "All transactions", icon: ArrowLeftRight },
    ],
  },
  {
    section: "Investing",
    items: [
      { to: "/holdings", label: "Holdings", icon: ChartCandlestick },
      { to: "/analysis", label: "Portfolio analysis", icon: Microscope },
      { to: "/allocation", label: "Allocation", icon: ChartPie },
      { to: "/income", label: "Investment income", icon: HandCoins },
      { to: "/room", label: "Contribution room", icon: PiggyBank },
    ],
  },
  {
    section: "Planning",
    items: [
      { to: "/projections", label: "Projections", icon: ChartSpline },
      { to: "/calculators", label: "Calculators", icon: Calculator },
    ],
  },
  {
    section: "App",
    items: [
      { to: "/upload", label: "Upload statements", icon: FileUp },
      { to: "/data", label: "Data", icon: Database },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
];
const ALL_ITEMS = NAV.flatMap((s) => s.items);

export function Shell() {
  const [theme, setTheme] = useTheme();
  const auth = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const title = ALL_ITEMS.find((i) => i.to === pathname)?.label ?? (pathname.startsWith("/holdings/") ? "Holding" : "Financials");
  const demo = useUi((s) => s.demo);
  const setDemo = useUi((s) => s.setDemo);
  const collapsed = useUi((s) => s.navCollapsed);
  const toggleNav = useUi((s) => s.toggleNav);

  // "[" toggles the sidebar (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "[" && !e.ctrlKey && !e.metaKey && !e.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !el.isContentEditable) toggleNav();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toggleNav]);

  // The login page gates the whole app (demo mode aside).
  if (!demo && auth.status !== "signed-in") return <LoginScreen />;

  return (
    <div className="flex min-h-dvh">
      <AppDataSync />
      {/* Pinned to the viewport: only the main column scrolls with the page. */}
      <aside
        className={cx(
          "sticky top-0 hidden h-dvh shrink-0 flex-col self-start overflow-y-auto overflow-x-hidden [scrollbar-width:thin] border-r border-line-subtle bg-bg-deep/70 transition-[width] duration-150 md:flex",
          collapsed ? "w-14" : "w-56",
        )}
      >
        <div className={cx("flex h-14 items-center gap-2", collapsed ? "justify-center px-2" : "px-4")}>
          {!collapsed && (
            <>
              <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-6" />
              <span className="flex-1 text-[15px] font-semibold tracking-tight">Financials</span>
            </>
          )}
          <button
            onClick={toggleNav}
            className="grid size-8 place-items-center rounded-md text-fg-3 hover:bg-hover hover:text-fg"
            title={collapsed ? "Expand sidebar  [" : "Collapse sidebar  ["}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        </div>
        <nav className="flex flex-col gap-0.5 px-2 py-2" aria-label="Main">
          {NAV.map((s) => (
            <div key={s.section} className="flex flex-col gap-0.5">
              {collapsed ? (
                <span className="mx-2 my-2 border-t border-line-subtle" aria-hidden />
              ) : (
                <span className="px-2 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-fg-3">{s.section}</span>
              )}
              {s.items.map((item) => (
                <NavLink key={item.to} item={item} iconOnly={collapsed} />
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-line-subtle bg-bg/85 backdrop-blur">
          <div className="flex h-14 items-center justify-between gap-3 px-4 md:px-6">
            <div className="flex items-center gap-2 md:hidden">
              <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-6" />
              <span className="font-semibold">Financials</span>
            </div>
            <h1 className="hidden text-[18px] font-semibold md:block">{title}</h1>
            <div className="flex items-center gap-2">
              <PersonSwitch />
              <PrivacyToggle />
              <Segmented<ThemePref>
                label="Theme"
                value={theme}
                onChange={setTheme}
                options={[
                  { value: "light", label: <Sun className="size-3.5" aria-label="Light" />, title: "Light" },
                  { value: "system", label: <Monitor className="size-3.5" aria-label="System" />, title: "Match system" },
                  { value: "dark", label: <Moon className="size-3.5" aria-label="Dark" />, title: "Dark" },
                ]}
              />
              {DEMO_ONLY ? null : auth.status === "signed-in" ? (
                <Button variant="ghost" onClick={signOut} title={`Signed in as ${auth.email}. Sign out of every tab.`}>
                  <LogOut className="size-4" aria-hidden /> <span className="hidden lg:inline">Sign out</span>
                </Button>
              ) : (
                <Button variant="primary" onClick={() => setDemo(false)} title="Leave demo mode and sign in">
                  Sign in
                </Button>
              )}
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2 md:hidden" aria-label="Main">
            {ALL_ITEMS.map((item) => (
              <NavLink key={item.to} item={item} compact />
            ))}
          </nav>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-6">
          <DemoBanner />
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NavLink({ item, compact, iconOnly }: { item: NavItem; compact?: boolean; iconOnly?: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      activeOptions={{ exact: item.to === "/" || item.to === "/spending" }}
      title={iconOnly ? item.label : undefined}
      aria-label={iconOnly ? item.label : undefined}
      className={cx(
        "flex h-8 shrink-0 items-center gap-2 rounded-md px-2 text-[13px] font-medium text-fg-2 hover:bg-hover hover:text-fg",
        "data-[status=active]:bg-selected data-[status=active]:text-fg",
        compact && "border border-line-subtle",
        iconOnly && "justify-center",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden /> {!iconOnly && item.label}
    </Link>
  );
}

function PersonSwitch() {
  const people = useSettings((s) => s.people);
  const person = useUi((s) => s.person);
  const setPerson = useUi((s) => s.setPerson);
  if (people.length < 2) return null;
  const valid = person === "all" || people.some((p) => p.id === person) ? person : "all";
  return (
    <Segmented<string>
      label="Whose money"
      value={valid}
      onChange={setPerson}
      options={[{ value: "all", label: "Everyone" }, ...people.map((p) => ({ value: p.id, label: p.name }))]}
    />
  );
}

function DemoBanner() {
  const demo = useUi((s) => s.demo);
  const setDemo = useUi((s) => s.setDemo);
  if (!demo) return null;
  if (DEMO_ONLY)
    return (
      <div className="mb-5 rounded-md border border-warn/30 bg-warn-subtle px-3 py-2 text-[13px]">
        <span className="font-semibold">Public demo.</span> Every account, name and number is fictional, and nothing you change is saved anywhere but this browser.
      </div>
    );
  return (
    <div className="mb-5 flex items-center justify-between gap-3 rounded-md border border-warn/30 bg-warn-subtle px-3 py-2 text-[13px]">
      <span>
        <span className="font-semibold">Demo data.</span> Everything shown is fictional.
      </span>
      <button className="font-medium underline" onClick={() => setDemo(false)}>
        Turn off
      </button>
    </div>
  );
}

function PrivacyToggle() {
  const privacy = useUi((s) => s.privacy);
  const toggle = useUi((s) => s.togglePrivacy);
  return (
    <Button
      variant="ghost"
      onClick={toggle}
      aria-pressed={privacy}
      title={privacy ? "Show amounts" : "Hide amounts (privacy mode)"}
      aria-label={privacy ? "Show amounts" : "Hide amounts"}
    >
      {privacy ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
    </Button>
  );
}

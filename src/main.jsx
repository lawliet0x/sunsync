import React, { useState, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import {
  Sun,
  LayoutDashboard,
  Zap,
  ArrowLeftRight,
  BarChart3,
  Trophy,
  Bell,
  Users,
  Settings,
  LogOut,
  ArrowUpRight,
  ArrowRight,
  Leaf,
  Menu,
  X,
  Building2,
  Shield,
  ChevronRight,
  Lock,
  Home,
  Activity,
  Check,
} from "lucide-react";
import "./style.css";
import { BackendProvider, useBackend, supabase, AuthForm } from "./backend.jsx";
const PublicReference = lazy(() => import("./PublicReference.jsx"));
const Workspace = lazy(() => import("./Workspace.jsx"));
const ROLES = {
  resident: {
    name: "Resident",
    short: "Your home, in harmony.",
    description:
      "Understand your own energy use, solar credits, savings and community participation.",
    icon: Home,
    nav: [
      ["Overview", LayoutDashboard],
      ["My consumption", Zap],
      ["My solar credits", Sun],
      ["My savings", BarChart3],
      ["Community", Trophy],
      ["Mira Bhayandar reference", Building2],
      ["Notifications", Bell],
      ["Profile & settings", Settings],
    ],
  },
  society: {
    name: "Society Admin",
    short: "Your society, connected.",
    description:
      "Oversee rooftop installations, resident participation and fair energy distribution.",
    icon: Building2,
    nav: [
      ["Overview", LayoutDashboard],
      ["Solar monitoring", Sun],
      ["Energy allocation", ArrowLeftRight],
      ["Residents & buildings", Users],
      ["Installations", Zap],
      ["Society analytics", BarChart3],
      ["Mira Bhayandar reference", Building2],
      ["Notifications", Bell],
      ["Society settings", Settings],
    ],
  },
  system: {
    name: "System Administrator",
    short: "A clearer view of the whole.",
    description:
      "Manage society onboarding, platform health, access policies and subscription configuration.",
    icon: Shield,
    nav: [
      ["Platform overview", LayoutDashboard],
      ["Societies", Building2],
      ["Approvals", Check],
      ["Platform health", Activity],
      ["Plans & limits", BarChart3],
      ["Mira Bhayandar reference", Building2],
      ["Audit & security", Shield],
      ["Platform settings", Settings],
    ],
  },
};
function DataNotice() {
  return (
    <aside className="demo-notice" role="note">
      Public-source records are read-only, historical or unverified as labelled,
      and do not indicate SunSync customer onboarding. Missing energy, resident,
      financial and environmental data is unavailable, not zero. Operational
      actions require separately approved permissions.
    </aside>
  );
}
class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error)
      return (
        <main className="panel" role="alert">
          <h1>SunSync could not display this page</h1>
          <p>{this.state.error.message}</p>
          <a className="btn" href="/">
            Return to home
          </a>
        </main>
      );
    return this.props.children;
  }
}
function App() {
  const { session, roles } = useBackend();
  const [now, setNow] = useState(new Date()),
    [route, setRoute] = useState(location.hash.slice(1) || "/"),
    [page, setPage] = useState(""),
    [mobile, setMobile] = useState(false),
    [notice, setNotice] = useState("");
  const PhaseIcon = Sun;
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000),
      change = () => {
        setRoute(location.hash.slice(1) || "/");
        setPage("");
        setMobile(false);
      };
    window.addEventListener("hashchange", change);
    return () => {
      clearInterval(t);
      window.removeEventListener("hashchange", change);
    };
  }, []);
  useEffect(() => {
    document.documentElement.removeAttribute("data-phase");
    document.querySelector('meta[name="theme-color"]').content = "#245841";
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(t);
  }, [notice]);
  const go = (p) => {
    if (location.hash === "#" + p) {
      setRoute(p);
      setPage("");
    } else location.hash = p;
  };
  let roleKey = route.includes("society")
      ? "society"
      : route.includes("system")
        ? "system"
        : "resident",
    role = ROLES[roleKey],
    RoleIcon = role.icon,
    isLogin = route === "/login" || route.startsWith("/login/"),
    isWorkspace = route.startsWith("/workspace/"),
    isRegister = route === "/register";
  const activePage = page || role.nav[0][0];
  const approvedWorkspace = roles.some((r) => r.role === roleKey);
  const time = now.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    }),
    date = now.toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  function clock(compact = false) {
    return (
      <div className={"local-clock " + (compact ? "compact" : "")}>
        <PhaseIcon size={compact ? 16 : 23} />
        <div>
          <strong>
            Local time <span>· {time}</span>
          </strong>
          {!compact && (
            <small>
              {date} · {timezone}
            </small>
          )}
        </div>
      </div>
    );
  }
  if (isWorkspace)
    return (
      <div className={"app-shell role-" + roleKey}>
        <aside className={mobile ? "sidebar open" : "sidebar"}>
          <a className="brand" href="#/" onClick={() => go("/")}>
            <span className="brand-icon">
              <Sun />
            </span>
            SunSync<span className="brand-dot">.</span>
          </a>
          <div className="workspace-label">DEDICATED WORKSPACE</div>
          <div className="role-identity">
            <RoleIcon size={21} />
            <div>
              <b>{approvedWorkspace ? role.name : "Read-only workspace"}</b>
              <small>
                {!approvedWorkspace
                  ? "No operational role assigned"
                  : roleKey === "resident"
                    ? "Personal energy"
                    : roleKey === "society"
                      ? "Society operations"
                      : "Platform oversight"}
              </small>
            </div>
          </div>
          <div className="nav-label">
            {!approvedWorkspace
              ? "PUBLIC-SOURCE WORKSPACE"
              : roleKey === "resident"
                ? "MY HOME"
                : roleKey === "society"
                  ? "MY SOCIETY"
                  : "PLATFORM"}
          </div>
          <nav>
            {role.nav.map(([n, I]) => (
              <button
                className={activePage === n ? "nav-item active" : "nav-item"}
                key={n}
                onClick={() => {
                  setPage(n);
                  setMobile(false);
                }}
              >
                <I size={19} />
                {n}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="planet-card">
              <PhaseIcon size={24} />
              <strong>Your community, connected.</strong>
              <p>
                {time} ·{" "}
                {now.toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                })}
              </p>
              <button onClick={() => setPage(role.nav.at(-1)[0])}>
                Workspace settings
                <ArrowRight size={14} />
              </button>
            </div>
            <div className="workspace-access">
              <Lock size={14} />
              <span>{session ? "Authenticated session" : "Not signed in"}</span>
            </div>
            <button
              className="signout"
              onClick={async () => {
                await supabase?.auth.signOut();
                go("/login/" + roleKey);
              }}
            >
              <LogOut size={15} /> {session ? "Sign out" : "Go to login"}
            </button>
            <button
              className="signout"
              onClick={() => go("/")}
              style={{ marginTop: 12 }}
            >
              <ArrowRight size={15} /> Back to home
            </button>
          </div>
        </aside>
        {mobile && <div className="scrim" onClick={() => setMobile(false)} />}
        <div className="workspace">
          <header className="topbar">
            <button
              className="icon-btn mobile-toggle"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu />
            </button>
            <div className="breadcrumb">
              {approvedWorkspace ? role.name : "Public-source access"}
              <ChevronRight size={13} />
              <span>{activePage}</span>
            </div>
            <div className="topbar-right">
              {clock(true)}
              <span className="access-tag">
                <Lock size={12} /> {session ? "Signed in" : "Not signed in"}
              </span>
            </div>
          </header>
          <main className="dashboard">
            <DataNotice />
            <Suspense fallback={<p role="status">Loading workspace…</p>}>
              {activePage === "Mira Bhayandar reference" ? (
                <PublicReference />
              ) : (
                <Workspace role={roleKey} page={activePage} />
              )}
            </Suspense>
            <footer className="dashboard-footer">
              <span>SunSync · Your energy, in harmony.</span>
              <span>
                {now.getFullYear()} · {timezone} · Secure Supabase workspace
              </span>
            </footer>
          </main>
        </div>
        {notice && (
          <div className="toast" role="status">
            {notice}
            <button aria-label="Dismiss" onClick={() => setNotice("")}>
              <X size={16} />
            </button>
          </div>
        )}
      </div>
    );
  if (isLogin || isRegister)
    return (
      <div className="auth">
        <div className="auth-story">
          <a className="brand" href="#/" onClick={() => go("/")}>
            <Sun /> SunSync.
          </a>
          <div>
            <span className="eyebrow">
              {isRegister
                ? "BRING YOUR COMMUNITY TOGETHER"
                : "ONE LOGIN. YOUR OWN WORKSPACE."}
            </span>
            <h1>
              {isRegister ? "Every community.\nA new beginning." : role.short}
            </h1>
            <p>
              {isRegister
                ? "Register your society and begin your shared solar journey."
                : role.description}
            </p>
            <div className="auth-orbit">
              <PhaseIcon size={130} strokeWidth={0.8} />
            </div>
          </div>
          {clock()}
        </div>
        <div className="auth-form">
          <DataNotice />
          <button className="plain" onClick={() => go("/")}>
            ← Back to home
          </button>
          {!isRegister && (
            <div className="account-selector">
              <span className="eyebrow">CHOOSE YOUR ACCOUNT TYPE</span>
              <div className="account-tabs">
                {Object.entries(ROLES).map(([k, r]) => (
                  <button
                    key={k}
                    type="button"
                    className={k === roleKey ? "selected" : ""}
                    aria-pressed={k === roleKey}
                    onClick={() => go("/login/" + k)}
                  >
                    <r.icon size={18} />
                    <span>{r.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="login-role-icon">
            {isRegister ? <Building2 size={27} /> : <RoleIcon size={27} />}
          </div>
          <span className="eyebrow">
            {isRegister
              ? "SOCIETY ONBOARDING"
              : role.name.toUpperCase() + " LOGIN"}
          </span>
          <h2>
            {isRegister
              ? "Let’s start with your society."
              : roleKey === "resident"
                ? "Welcome home."
                : roleKey === "society"
                  ? "Welcome to your society workspace."
                  : "Platform administrator access."}
          </h2>
          <p>
            {isRegister
              ? "Create an account, confirm your email, then submit an approval application."
              : roleKey === "resident"
                ? "Sign in to your personal energy account."
                : roleKey === "society"
                  ? "Use your society administrator account to continue."
                  : "Restricted to authorized platform operators. No public administrator registration."}
          </p>
          <AuthForm register={isRegister} role={roleKey} go={go} />
          <div className="role-login-links">
            <span>
              Account selection changes navigation only. Database permissions
              determine access.
            </span>
          </div>
        </div>
      </div>
    );
  return (
    <div className="landing">
      <DataNotice />
      <div className="ambient-sky">
        <span className="sky-orb" />
      </div>
      <nav className="landing-nav">
        <a className="brand" href="#/">
          <span className="brand-icon">
            <Sun />
          </span>
          SunSync<span className="brand-dot">.</span>
        </a>
        <div className="landing-links">
          <a
            href="#features"
            onClick={(e) => {
              e.preventDefault();
              document
                .getElementById("features")
                ?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            How it works
          </a>
          {clock(true)}
          <button className="btn" onClick={() => go("/login")}>
            Log in
            <ArrowUpRight size={15} />
          </button>
        </div>
      </nav>
      <main>
        <section className="hero">
          <div>
            <span className="eyebrow">
              <span className="dot" /> CLEAN ENERGY. SHARED POSSIBILITIES.
            </span>
            <h1>
              A little sunshine.
              <br />A greener
              <br />
              <em>community.</em>
            </h1>
            <p>
              One place for your rooftop solar, your community’s energy, and the
              difference you make together. Built around the people who call it
              home.
            </p>
            <div className="actions">
              <button className="btn" onClick={() => go("/login")}>
                Get started
                <ArrowUpRight size={17} />
              </button>
              <button
                className="outline"
                onClick={() =>
                  document
                    .getElementById("features")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
              >
                Discover SunSync
                <ArrowRight size={17} />
              </button>
            </div>
            <div className="hero-note">
              <PhaseIcon size={16} /> Solar yellow. Fresh green. Open sky.
            </div>
          </div>
          <div className="solar-scene">
            <div className="sun-orbit">
              <PhaseIcon size={76} strokeWidth={1} />
            </div>
            <div className="scene-label">
              <span className="dot" /> DIFFERENT HOMES. ONE SHARED HORIZON.
            </div>
            <div className="building b-one">
              <div className="panels" />
              {Array.from({ length: 12 }, (_, i) => (
                <i key={i} />
              ))}
            </div>
            <div className="building b-two">
              <div className="panels" />
              {Array.from({ length: 9 }, (_, i) => (
                <i key={i} />
              ))}
            </div>
            <div className="scene-landscape" />
            <div className="floating">
              <Leaf size={24} />
              <div>
                <strong>Good energy brings us together.</strong>
                <span>A clearer view for every person, every role.</span>
              </div>
            </div>
            <span className="scene-foot">
              A VISION FOR CONNECTED COMMUNITIES
            </span>
          </div>
        </section>
        <section id="features" className="features product-overview">
          <span className="eyebrow">ONE ROOFTOP. A WORLD OF POSSIBILITY.</span>
          <h2>Your community’s solar story, in one place.</h2>
          <p className="section-intro">
            SunSync brings solar generation, electricity consumption, surplus
            sharing and sustainability insights together—so communities can
            understand their energy and use it more thoughtfully.
          </p>
          <div className="three-grid">
            {[
              [
                Sun,
                "Understand your energy",
                "See rooftop solar production alongside electricity consumption. Clear monitoring helps you understand when energy is available and where it is needed.",
              ],
              [
                ArrowLeftRight,
                "Put surplus to better use",
                "Coordinate fair sharing of available solar energy within your society, with allocation records that make every contribution easier to follow.",
              ],
              [
                Leaf,
                "See the bigger picture",
                "Explore estimated savings, solar credits and avoided emissions with transparent calculations, alongside community achievements and participation.",
              ],
            ].map(([I, title, text]) => (
              <article className="panel overview-feature" key={title}>
                <span className="entrance-icon">
                  <I size={25} />
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="benefit-strip">
          <span>
            Less waste.
            <br />
            <b>More shared value.</b>
          </span>
          <p>Understand how your rooftop generates energy.</p>
          <p>Connect available surplus with community demand.</p>
          <p>Make informed decisions about cost and environmental impact.</p>
        </section>
        <section className="features how-it-works">
          <span className="eyebrow">A SIMPLER WAY TO CONNECT</span>
          <h2>From sunshine to shared impact.</h2>
          <div className="three-grid">
            {[
              [
                "01",
                "Connect your community",
                "Bring your society, rooftop installations and participating homes into one organized workspace.",
              ],
              [
                "02",
                "Follow the energy",
                "Use connected meter records to understand generation, consumption and available surplus.",
              ],
              [
                "03",
                "Share and understand",
                "Review allocations, track personal benefits and explore community-level sustainability progress.",
              ],
            ].map(([n, t, d]) => (
              <article className="panel" key={n}>
                <span className="step-number">{n}</span>
                <h3>{t}</h3>
                <p>{d}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="features fixed-theme-story">
          <span className="eyebrow">CONNECTED BY CLEAN ENERGY</span>
          <h2>From your rooftop to your community.</h2>
          <p>
            Monitor generation, coordinate surplus sharing and understand your
            impact—all through one clear platform.
          </p>
          <button className="btn" onClick={() => go("/login")}>
            Go to login
            <ArrowRight size={16} />
          </button>
        </section>
        <section className="truth-note">
          <Shield size={21} />
          <div>
            <b>Real data belongs at the heart of this.</b>
            <p>
              No invented readings, residents, revenue or results. Workspaces
              display authenticated records only. Tariffs and emission factors
              must have documented sources; calculated benefits remain
              estimates.
            </p>
          </div>
        </section>
      </main>
      <footer>
        <span className="brand">
          <Sun /> SunSync.
        </span>
        <span>Better energy. A shared horizon.</span>
        <span>
          {date} · {timezone}
        </span>
      </footer>
    </div>
  );
}
createRoot(document.getElementById("root")).render(
  <AppErrorBoundary>
    <BackendProvider>
      <App />
    </BackendProvider>
  </AppErrorBoundary>,
);

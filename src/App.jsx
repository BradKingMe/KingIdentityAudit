import { Fragment, useMemo, useRef, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Input,
  MessageBar,
  MessageBarBody,
} from "@fluentui/react-components";
import {
  ArrowUpload24Regular,
  BookOpen24Regular,
  Database24Regular,
  DocumentPdf24Regular,
  Home24Regular,
  People24Regular,
  Search24Regular,
  ShieldCheckmark24Regular,
  Warning24Regular,
} from "@fluentui/react-icons";
import { buildFindings } from "./domain/audit.js";
import { createWorkspaceSnapshot, parseSnapshotText } from "./domain/snapshot.js";
import { demoSnapshot } from "./data/demoSnapshot.js";
import { formatDate, formatRelativeDays } from "./domain/snapshot.js";
import { matchEntraUser } from "./domain/workspace.js";
import { matchesEntraIdentity, sameADPrincipal, sameTenant } from "./domain/identity.js";
import { mergeCloudEvidence } from "./domain/evidence.js";
import { collectEntraEvidence } from "./connectors/entra.js";
import { collectIntuneEvidence } from "./connectors/intune.js";
import { AccessInvestigationView, CompareView, SourcesView, TasksView } from "./views/EnterpriseViews.jsx";
import collectorScript from "../collectors/Collect-ADDS.ps1?raw";
import { AccessWorkbench } from './views/AccessWorkbench.jsx';

const navigation = [
  { id: "overview", label: "Overview", icon: Home24Regular },
  { id: "findings", label: "Findings", icon: Warning24Regular },
  { id: "directory", label: "Directory", icon: People24Regular },
  { id: "access", label: "Access", icon: Search24Regular },
  { id: "compare", label: "Compare", icon: BookOpen24Regular },
  { id: "tasks", label: "Tasks", icon: ShieldCheckmark24Regular },
  { id: "collection", label: "Sources", icon: Database24Regular },
];

const pageTitles = {
  overview: "Identity posture review",
  findings: "Finding register",
  directory: "Directory inventory",
  access: "Access explorer & employee reviews",
  compare: "Snapshot comparison",
  tasks: "Guided tasks",
  collection: "Data sources",
};

const pageDescriptions = {
  overview: "Review explainable identity signals from the selected snapshot.",
  findings: "Open a finding to inspect affected accounts, evidence, limits, and guidance.",
  directory: "Browse directory accounts and open a profile to understand its access and review signals.",
  access: "Trace recorded access paths, inspect account context and prepare an owner-led employee review.",
  compare: "Compare two evidence snapshots using source identifiers and review what changed or was not returned.",
  tasks: "Prepare local review checklists and action plans for an authorized owner to verify.",
  collection: "Connect optional read-only evidence sources and inspect coverage, permissions, and freshness.",
};

const severityMeta = {
  high: { label: "High", color: "danger" },
  moderate: { label: "Moderate", color: "warning" },
  review: { label: "Review", color: "informative" },
  info: { label: "Inventory", color: "subtle" },
};

function SeverityBadge({ severity }) {
  const meta = severityMeta[severity] || severityMeta.info;
  return <Badge appearance="tint" color={meta.color}>{meta.label}</Badge>;
}

function Metric({ label, value, caption, tone }) {
  return (
    <Card className={`metric-card metric-${tone}`}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      <div className="metric-caption">{caption}</div>
    </Card>
  );
}

function FindingButton({ finding, onSelect }) {
  return (
    <button className="finding-link" type="button" onClick={() => onSelect(finding)}>
      <span className="finding-link-title">{finding.title}</span>
      <span className="finding-link-subtitle">{finding.domain} · {finding.category}</span>
    </button>
  );
}

function principalKey(principal) {
  if (principal.objectGuid) return `guid:${principal.objectGuid}`;
  if (principal.objectSid) return `sid:${principal.objectSid}`;
  return `${principal.domain}:${principal.objectClass}:${principal.accountName}`;
}

function samePrincipal(left, right) {
  return sameADPrincipal(left, right);
}

function isTenantSelector(value) {
  const tenantIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const tenantDomainPattern = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;
  return tenantIdPattern.test(value) || tenantDomainPattern.test(value);
}

function AccountStatus({ enabled }) {
  const status = enabled === true ? "enabled" : enabled === false ? "disabled" : "unknown";
  const label = enabled === true ? "Enabled" : enabled === false ? "Disabled" : "Unknown";
  return (
    <span className={`account-status is-${status}`}>
      <span className="status-mark" aria-hidden="true" />
      {label}
    </span>
  );
}

function App() {
  const [snapshot, setSnapshot] = useState(demoSnapshot);
  const [datasetLabel, setDatasetLabel] = useState("Synthetic demo environment");
  const [view, setView] = useState("overview");
  const [selectedFinding, setSelectedFinding] = useState(null);
  const [selectedPrincipalKey, setSelectedPrincipalKey] = useState(null);
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [importError, setImportError] = useState("");
  const [connectorError, setConnectorError] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [compareSnapshot, setCompareSnapshot] = useState(null);
  const [compareImportError, setCompareImportError] = useState("");
  const [employeeReviews, setEmployeeReviews] = useState([]);
  const fileInput = useRef(null);
  const msalRef = useRef(null);
  const workspaceGeneration = useRef(0);
  const connectionInProgress = useRef(false);
  const connectionAbort = useRef(null);
  const importGeneration = useRef(0);
  const comparisonImportGeneration = useRef(0);

  const findings = useMemo(() => buildFindings(snapshot), [snapshot]);
  const counts = useMemo(() => {
    const count = { high: 0, moderate: 0, review: 0, info: 0 };
    for (const finding of findings) count[finding.severity] = (count[finding.severity] || 0) + 1;
    return count;
  }, [findings]);

  const principals = useMemo(() => snapshot.domains.flatMap((domain) =>
    (domain.principals || []).map((principal) => ({ ...principal, domain: domain.name }))
  ), [snapshot]);

  const filteredFindings = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return findings.filter((finding) => {
      const matchesSeverity = severityFilter === "all" || finding.severity === severityFilter;
      const haystack = [
        finding.title,
        finding.domain,
        finding.category,
        finding.summary,
        ...(finding.evidence || []),
      ].join(" ").toLocaleLowerCase();
      return matchesSeverity && (!term || haystack.includes(term));
    });
  }, [findings, search, severityFilter]);

  const filteredPrincipals = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return principals.filter((principal) => {
      const matchesState = accountFilter === "all" ||
        (accountFilter === "enabled" ? principal.enabled === true : principal.enabled === false);
      const matchesSearch = !term || [
        principal.accountName,
        principal.domain,
        principal.objectClass,
        ...(principal.servicePrincipalNames || []),
      ].join(" ").toLocaleLowerCase().includes(term);
      return matchesState && matchesSearch;
    });
  }, [principals, accountFilter, search]);

  const enabledCount = principals.filter((principal) => principal.enabled === true).length;
  const domainControllerCount = snapshot.domains.reduce((total, domain) => total + (domain.domainControllers || []).length, 0);
  const privilegedMemberCount = snapshot.domains.reduce((total, domain) =>
    total + (domain.privilegedGroups || []).reduce((groupTotal, group) => groupTotal + (group.members || []).length, 0), 0
  );

  async function handleImport(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    const generation = ++importGeneration.current;
    setImportError("");
    if (file.size > 25 * 1024 * 1024) {
      setImportError("That file is larger than the 25 MB import limit.");
      input.value = "";
      return;
    }
    try {
      const parsed = parseSnapshotText(await file.text());
      if (generation !== importGeneration.current) return;
      workspaceGeneration.current += 1;
      connectionAbort.current?.abort();
      setSnapshot(parsed);
      setSelectedFinding(null);
      setCompareSnapshot(null);
      comparisonImportGeneration.current += 1;
      setCompareImportError("");
      setDatasetLabel(file.name);
      setSearch("");
      setSeverityFilter("all");
      setAccountFilter("all");
      setSelectedPrincipalKey(null);
      setView("overview");
    } catch (error) {
      if (generation === importGeneration.current) setImportError(error instanceof Error ? error.message : "The selected snapshot could not be read.");
    } finally {
      input.value = "";
    }
  }

  function restoreDemo() {
    workspaceGeneration.current += 1;
    connectionAbort.current?.abort();
    importGeneration.current += 1;
    comparisonImportGeneration.current += 1;
    setSnapshot(demoSnapshot);
    setDatasetLabel("Synthetic demo environment");
    setImportError("");
    setSearch("");
    setSeverityFilter("all");
    setAccountFilter("all");
    setSelectedFinding(null);
    setSelectedPrincipalKey(null);
    setCompareSnapshot(null);
    setCompareImportError("");
  }

  async function connectMicrosoftSources(options) {
    if (connectionInProgress.current) return;
    connectionInProgress.current = true;
    const generation = workspaceGeneration.current;
    const controller = new AbortController();
    connectionAbort.current = controller;
    setConnectorError("");
    setIsConnecting(true);
    try {
      const { InteractionRequiredAuthError, PublicClientApplication } = await import("@azure/msal-browser");
      if (!isTenantSelector(options.tenantId) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(options.clientId)) {
        throw new Error("Enter a tenant ID or tenant domain and a valid application (client) ID. Do not enter a client secret.");
      }
      const configKey = `${options.tenantId.toLocaleLowerCase()}:${options.clientId.toLocaleLowerCase()}`;
      if (!msalRef.current || msalRef.current.configKey !== configKey) {
        msalRef.current = {
          configKey,
          initialized: false,
          instance: new PublicClientApplication({
            auth: {
              clientId: options.clientId,
              authority: `https://login.microsoftonline.com/${encodeURIComponent(options.tenantId)}`,
              redirectUri: new URL("redirect.html", window.location.href).href,
            },
            cache: { cacheLocation: "memoryStorage" },
          }),
        };
      }
      const authClient = msalRef.current;
      const instance = authClient.instance;
      if (!authClient.initialized) {
        await instance.initialize();
        authClient.initialized = true;
      }
      // Establish the operator session first. Graph permissions are acquired per source below,
      // so optional consent failures do not prevent the other selected evidence from loading.
      const login = await instance.loginPopup({ prompt: "select_account" });
      controller.signal.throwIfAborted();
      const account = login.account;
      if (!account) throw new Error("Microsoft sign-in completed without returning an account.");
      const tokenRequests = new Map();
      let tokenQueue = Promise.resolve();
      const getToken = (scopes) => {
        const key = [...scopes].sort().join(" ");
        if (!tokenRequests.has(key)) {
          const request = tokenQueue.then(async () => {
            controller.signal.throwIfAborted();
            try {
              const result = await instance.acquireTokenSilent({ scopes, account });
              controller.signal.throwIfAborted();
              return result.accessToken;
            } catch (error) {
              if (!(error instanceof InteractionRequiredAuthError)) throw error;
              const result = await instance.acquireTokenPopup({ scopes, account });
              controller.signal.throwIfAborted();
              return result.accessToken;
            }
          });
          tokenRequests.set(key, request);
          // MSAL allows only one interactive popup at a time. Keep later permission prompts
          // moving if an earlier, optional consent request is declined or unavailable.
          tokenQueue = request.catch(() => undefined);
        }
        return tokenRequests.get(key);
      };

      const [entra, intune] = await Promise.all([
        options.includeDirectory || options.includeActivity || options.includeAccess
          ? collectEntraEvidence({
            getToken,
            includeDirectory: options.includeDirectory,
            includeAccountDetails: options.includeAccountDetails,
            includeActivity: options.includeActivity,
            includeAccess: options.includeAccess,
            activityDays: options.activityDays,
            tenantId: account.tenantId || options.tenantId,
            signal: controller.signal,
          })
          : Promise.resolve(null),
        options.includeIntune
          ? collectIntuneEvidence({ getToken, tenantId: account.tenantId || options.tenantId, signal: controller.signal })
          : Promise.resolve(null),
      ]);

      if (generation !== workspaceGeneration.current) return;
      setSnapshot((current) => mergeCloudEvidence(current, { entra, intune }));
      setSelectedFinding(null);
      setSelectedPrincipalKey(null);
    } catch (error) {
      if (generation !== workspaceGeneration.current) return;
      const authError = error?.name?.includes("AuthError") || error?.name?.includes("BrowserAuthError");
      setConnectorError(authError
        ? "Microsoft sign-in or consent could not be completed. Check the tenant, client ID, SPA redirect URI, and delegated admin consent."
        : error instanceof Error ? error.message : "The Microsoft connector could not start.");
    } finally {
      connectionInProgress.current = false;
      if (connectionAbort.current === controller) connectionAbort.current = null;
      setIsConnecting(false);
    }
  }

  function clearCloudEvidence() {
    workspaceGeneration.current += 1;
    connectionAbort.current?.abort();
    msalRef.current = null;
    setSnapshot((current) => {
      const evidenceSources = { ...(current.evidenceSources || {}) };
      delete evidenceSources.entra;
      delete evidenceSources.intune;
      return { ...current, evidenceSources };
    });
    setConnectorError("");
  }

  function exportWorkspaceSnapshot() {
    const workspace = createWorkspaceSnapshot(snapshot);
    const blob = new Blob([JSON.stringify(workspace, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "kingidentity-workspace-snapshot.json";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function handleCompareImport(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    const generation = ++comparisonImportGeneration.current;
    setCompareImportError("");
    if (file.size > 25 * 1024 * 1024) {
      setCompareImportError("That file is larger than the 25 MB comparison limit.");
      input.value = "";
      return;
    }
    try {
      const parsed = parseSnapshotText(await file.text());
      if (generation === comparisonImportGeneration.current) setCompareSnapshot(parsed);
    } catch (error) {
      if (generation === comparisonImportGeneration.current) setCompareImportError(error instanceof Error ? error.message : "The earlier workspace snapshot could not be read.");
    } finally {
      input.value = "";
    }
  }

  function printReport() {
    window.print();
  }

  function downloadCollector() {
    const file = new Blob([collectorScript], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = "Collect-ADDS.ps1";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const priorityFindings = findings.filter((finding) => finding.severity !== "info").slice(0, 5);
  const isDemo = snapshot.adSourceMode === "synthetic";
  const shownDatasetLabel = snapshot.adSourceMode === "none" ? "Microsoft cloud workspace" : datasetLabel;
  const taskSubjects = useMemo(() => [
    ...principals.map((principal) => ({
      key: `ad:${principalKey(principal)}`,
      label: `${principal.accountName} · AD DS${principal.userPrincipalName ? ` · ${principal.userPrincipalName}` : ""}`,
      record: principal,
    })),
    ...(snapshot.evidenceSources?.entra?.users || []).map((user) => ({
      key: `entra:${user.id}`,
      label: `${user.displayName || user.userPrincipalName || user.id} · Entra ID`,
      record: user,
    })),
  ], [principals, snapshot.evidenceSources?.entra?.users]);

  return (
    <div className="app-shell">
      <aside className="side-rail">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><ShieldCheckmark24Regular /></div>
          <div className="brand-copy">
            <strong>KingIdentity</strong>
            <span>Identity workbench</span>
          </div>
        </div>

        <div className="nav-caption">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Primary navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              appearance={view === id ? "primary" : "subtle"}
              className={`nav-button ${view === id ? "is-current" : ""}`}
              icon={<Icon />}
              onClick={() => { setView(id); setSearch(""); }}
              aria-current={view === id ? "page" : undefined}
            >
              <span>{label}</span>
            </Button>
          ))}
        </nav>

        <div className="rail-spacer" />
        <div className="rail-note">
          <span className="rail-note-mark"><span /></span>
          <div>
            <strong>Local review</strong>
            <span>Session-local evidence</span>
          </div>
        </div>
        <div className="rail-version">KINGIDENTITY · PREVIEW</div>
      </aside>

      <main className="workspace-main">
        <header className="top-bar">
          <div className="breadcrumb">Identity operations <span>/</span> {pageTitles[view]}</div>
          <div className="top-bar-status"><span className="local-dot" /> Local session</div>
        </header>

        <div className="page-wrap">
          <section className="page-heading">
            <div>
              <h1>{pageTitles[view]}</h1>
              <p className="page-description">{pageDescriptions[view]}</p>
            </div>
            <div className="page-actions">
              <input
                ref={fileInput}
                className="visually-hidden"
                type="file"
                accept="application/json,.json"
                aria-label="Choose KingIdentity JSON snapshot"
                onChange={handleImport}
              />
              <Button appearance="secondary" icon={<ArrowUpload24Regular />} onClick={() => fileInput.current?.click()}>
                Import snapshot
              </Button>
              <Button appearance="primary" icon={<DocumentPdf24Regular />} onClick={printReport}>
                Save report
              </Button>
            </div>
          </section>

          <section className="snapshot-strip" aria-label="Snapshot context">
            <div className="snapshot-indicator"><span className="snapshot-dot" /> {isDemo ? "SYNTHETIC DATA" : "LOCAL SNAPSHOT"}</div>
            <div className="snapshot-details">
              <span className="snapshot-label">Source</span>
              <strong title={shownDatasetLabel}>{shownDatasetLabel}</strong>
              <span className="snapshot-divider" />
              <span className="snapshot-label">Forest</span>
              <strong>{snapshot.forest?.name || "Unknown forest"}</strong>
              <span className="snapshot-divider" />
              <span className="snapshot-label">Captured</span>
              <strong>{formatDate(snapshot.capturedAt, { withTime: true })}</strong>
            </div>
            {snapshot !== demoSnapshot && <Button appearance="subtle" size="small" onClick={restoreDemo}>Restore demo</Button>}
          </section>

          {importError && (
            <MessageBar intent="error" className="import-message">
              <MessageBarBody>{importError}</MessageBarBody>
            </MessageBar>
          )}

          {snapshot.collectionWarnings?.length > 0 && (
            <MessageBar intent="warning" className="import-message">
              <MessageBarBody>
                Snapshot contains {snapshot.collectionWarnings.length} collection warning{snapshot.collectionWarnings.length === 1 ? "" : "s"}. Review the Collection page before interpreting an empty result.
              </MessageBarBody>
            </MessageBar>
          )}

          {view === "overview" && (
            <Overview
              counts={counts}
              findings={priorityFindings}
              snapshot={snapshot}
              enabledCount={enabledCount}
              domainControllerCount={domainControllerCount}
              privilegedMemberCount={privilegedMemberCount}
              onSelectFinding={setSelectedFinding}
              onShowFindings={() => setView("findings")}
            />
          )}

          {view === "findings" && (
            <FindingsView
              findings={filteredFindings}
              search={search}
              onSearch={setSearch}
              severityFilter={severityFilter}
              onSeverityFilter={setSeverityFilter}
              onSelectFinding={setSelectedFinding}
            />
          )}

          {view === "directory" && (
            <DirectoryView
              principals={filteredPrincipals}
              search={search}
              onSearch={setSearch}
              accountFilter={accountFilter}
              onAccountFilter={setAccountFilter}
              snapshot={snapshot}
              findings={findings}
              selectedPrincipalKey={selectedPrincipalKey}
              onSelectPrincipal={(principal) => setSelectedPrincipalKey((current) =>
                principal && current !== principalKey(principal) ? principalKey(principal) : null
              )}
              onSelectFinding={setSelectedFinding}
            />
          )}

          {view === "access" && <AccessWorkbench snapshot={snapshot} principals={principals} reviews={employeeReviews} onReviews={setEmployeeReviews} />}

          {view === "compare" && (
            <CompareView
              current={snapshot}
              baseline={compareSnapshot}
              onBaseline={handleCompareImport}
              onClearBaseline={() => { comparisonImportGeneration.current += 1; setCompareSnapshot(null); setCompareImportError(""); }}
              importError={compareImportError}
            />
          )}

          {view === "tasks" && <TasksView snapshot={snapshot} subjects={taskSubjects} />}

          {view === "collection" && (
            <SourcesView
              snapshot={snapshot}
              datasetLabel={datasetLabel}
              onDownloadCollector={downloadCollector}
              onExportSnapshot={exportWorkspaceSnapshot}
              onConnect={connectMicrosoftSources}
              onClearCloud={clearCloudEvidence}
              isConnecting={isConnecting}
              connectorError={connectorError}
            />
          )}

          <footer className="page-footer">
            <span>Evidence-led triage · no automatic remediation</span>
            <span>KingIdentity Audit · 0.2.0</span>
          </footer>
        </div>
      </main>

      <Dialog open={Boolean(selectedFinding)} onOpenChange={(_, data) => { if (!data.open) setSelectedFinding(null); }}>
        <DialogSurface className="finding-dialog">
          {selectedFinding && (
            <DialogBody>
              <DialogTitle>
                <div className="dialog-title-row">
                  <SeverityBadge severity={selectedFinding.severity} />
                  <span>{selectedFinding.title}</span>
                </div>
              </DialogTitle>
              <DialogContent>
                <div className="dialog-domain">{selectedFinding.domain} · {selectedFinding.category}</div>
                <p>{selectedFinding.summary}</p>
                <h3>Evidence in this snapshot</h3>
                <ul className="evidence-list">
                  {selectedFinding.evidence.slice(0, 200).map((item, index) => <li key={`${selectedFinding.id}-${index}`}>{item}</li>)}
                </ul>
                {selectedFinding.evidence.length > 200 && <p>Showing 200 of {selectedFinding.evidence.length} evidence items. Use Directory search or the workspace export to inspect the remaining records.</p>}
                <h3>Recommended review</h3>
                <p>{selectedFinding.recommendation}</p>
                <div className="limitation-box">
                  <strong>Interpretation limit</strong>
                  <p>{selectedFinding.limitation}</p>
                </div>
                <a className="source-link" href={selectedFinding.source.url} target="_blank" rel="noreferrer">
                  {selectedFinding.source.label}
                </a>
              </DialogContent>
              <DialogActions>
                <Button appearance="primary" onClick={() => setSelectedFinding(null)}>Close review</Button>
              </DialogActions>
            </DialogBody>
          )}
        </DialogSurface>
      </Dialog>
    </div>
  );
}

function Overview({ counts, findings, snapshot, enabledCount, domainControllerCount, privilegedMemberCount, onSelectFinding, onShowFindings }) {
  return (
    <>
      <section className="metrics-grid" aria-label="Finding counts">
        <Metric label="High priority" value={counts.high} caption="Signals needing prompt owner review" tone="high" />
        <Metric label="Moderate" value={counts.moderate} caption="Account hygiene signals" tone="moderate" />
        <Metric label="Review" value={counts.review} caption="Context needed before classifying" tone="review" />
        <Metric label="Inventory" value={counts.info} caption="Evidence to compare with approved roles" tone="inventory" />
      </section>

      <section className="overview-grid">
        <Card className="panel priority-panel">
          <div className="panel-heading">
            <div>
              <div className="section-kicker">TRIAGE</div>
              <h2>Priority queue</h2>
              <p>Signals ordered by review priority, with context available for each.</p>
            </div>
            <Button appearance="subtle" onClick={onShowFindings}>Open register</Button>
          </div>
          {findings.length ? (
            <div className="priority-list">
              {findings.map((finding) => (
                <div className="priority-row" key={finding.id}>
                  <div className={`priority-marker priority-${finding.severity}`} aria-hidden="true" />
                  <FindingButton finding={finding} onSelect={onSelectFinding} />
                  <SeverityBadge severity={finding.severity} />
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <ShieldCheckmark24Regular />
              <strong>No review signals matched</strong>
              <span>This is not a security certification. Check collection scope and warnings.</span>
            </div>
          )}
        </Card>

        <div className="overview-side">
          <Card className="panel facts-panel">
            <div className="section-kicker">SCOPE AT A GLANCE</div>
            <h2>Collected footprint</h2>
            <div className="footprint-list">
              <div><span>Domains</span><strong>{snapshot.domains.length}</strong></div>
              <div><span>Enabled principals</span><strong>{enabledCount}</strong></div>
              <div><span>Domain controllers</span><strong>{domainControllerCount}</strong></div>
              <div><span>Privileged memberships</span><strong>{privilegedMemberCount}</strong></div>
            </div>
            <div className="footprint-note">Counts describe data returned in this snapshot; collection warnings can limit coverage.</div>
          </Card>

          <Card className="context-panel">
            <div className="context-icon"><BookOpen24Regular /></div>
            <div>
              <strong>Read the evidence in context</strong>
              <p>Directory state is not intent. Confirm ownership, policy, and workload needs before acting.</p>
            </div>
          </Card>
        </div>
      </section>
    </>
  );
}

function FindingsView({ findings, search, onSearch, severityFilter, onSeverityFilter, onSelectFinding }) {
  const filters = [
    ["all", "All"], ["high", "High"], ["moderate", "Moderate"], ["review", "Review"], ["info", "Inventory"],
  ];

  return (
    <section className="panel register-panel">
      <div className="panel-heading register-heading">
        <div>
          <div className="section-kicker">EVIDENCE REGISTER</div>
          <h2>Findings and review signals</h2>
          <p>Open a row to review affected objects, evidence limits, and Microsoft guidance.</p>
        </div>
        <div className="register-count">{findings.length} shown</div>
      </div>
      <div className="filter-toolbar">
        <Input
          className="search-input"
          contentBefore={<Search24Regular />}
          placeholder="Search findings, domains, or accounts"
          value={search}
          onChange={(_, data) => onSearch(data.value)}
          aria-label="Search findings"
        />
        <div className="filter-pills" role="group" aria-label="Filter findings by priority">
          {filters.map(([value, label]) => (
            <Button
              key={value}
              size="small"
              appearance={severityFilter === value ? "primary" : "subtle"}
              onClick={() => onSeverityFilter(value)}
              aria-pressed={severityFilter === value}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      {findings.length ? (
        <div className="table-scroll">
          <table className="data-table finding-table">
            <thead><tr><th scope="col">Finding</th><th scope="col">Priority</th><th scope="col">Domain</th><th scope="col">Evidence</th></tr></thead>
            <tbody>
              {findings.map((finding) => (
                <tr key={finding.id}>
                  <td data-label="Finding"><FindingButton finding={finding} onSelect={onSelectFinding} /></td>
                  <td data-label="Priority"><SeverityBadge severity={finding.severity} /></td>
                  <td data-label="Domain">{finding.domain}</td>
                  <td data-label="Evidence">{finding.evidence.length} item{finding.evidence.length === 1 ? "" : "s"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state compact-empty"><strong>No findings match these filters</strong><span>Clear the search or select a different priority.</span></div>
      )}
    </section>
  );
}

function signalValue(value) {
  return value == null ? "Not collected" : value ? "Yes" : "No";
}

function IdentityProfile({ principal, domain, capturedAt, findings, evidenceSources, onClose, onSelectFinding, id }) {
  const memberships = (domain?.privilegedGroups || []).filter((group) =>
    (group.members || []).some((member) => samePrincipal(member, principal))
  );
  const relatedFindings = findings.filter((finding) =>
    finding.domain === principal.domain &&
    (finding.affected || []).some((affected) => samePrincipal(affected, principal) ||
      (finding.category !== "Privilege inventory" && !affected.objectGuid && !affected.objectSid &&
        affected.accountName === principal.accountName && affected.objectClass === principal.objectClass))
  );
  const entraMatch = matchEntraUser(principal, evidenceSources?.entra?.users || []);
  const entraUser = entraMatch.user;
  const relatedDevices = (evidenceSources?.intune?.devices || []).filter((device) =>
    sameTenant(evidenceSources?.entra, evidenceSources?.intune) && matchesEntraIdentity(device, entraUser)
  );

  return (
    <section className="identity-profile" id={id} aria-label={`Account profile for ${principal.accountName}`}>
      <div className="identity-profile-heading">
        <div>
          <h3>{principal.accountName || "Unnamed principal"}</h3>
          <p>{principal.domain} <span>·</span> {principal.objectClass || "Unknown object type"}</p>
        </div>
        <div className="identity-profile-actions">
          <AccountStatus enabled={principal.enabled} />
          <Button appearance="subtle" size="small" onClick={onClose}>Close profile</Button>
        </div>
      </div>

      <section className="identity-subsection identity-cross-source">
        <h4>Cross-source identity context</h4>
        {entraUser ? (
          <div className="cross-source-card">
            <div><strong>{entraUser.displayName || entraUser.userPrincipalName}</strong><span>Entra ID · matched by {entraMatch.method}</span></div>
            <span>{entraUser.accountEnabled == null ? "State not returned" : entraUser.accountEnabled ? "Enabled" : "Disabled"} · {entraUser.userType || "Type not returned"}</span>
          </div>
        ) : entraMatch.ambiguous ? (
          <p className="identity-empty">More than one Entra account has this exact UPN. The records are not merged.</p>
        ) : (
          <p className="identity-empty">No Entra user matched by exact UPN. Display names are never used to merge accounts.</p>
        )}
        {relatedDevices.length > 0 ? (
          <div className="related-devices compact-related-devices">
            <h5>Matched Intune devices</h5>
            {relatedDevices.slice(0, 10).map((device) => <div key={device.id}><strong>{device.deviceName || device.id}</strong><span>{device.complianceState || "Compliance not returned"} · {device.operatingSystem || "OS not returned"} · last sync {formatDate(device.lastSyncDateTime)}</span></div>)}
          </div>
        ) : <p className="identity-empty">No Intune device matched by Entra user ID or exact UPN.</p>}
        <p className="identity-limit">Source IDs and UPN matches remain separate evidence. A match does not prove that two directory objects are fully synchronized or belong to the same person.</p>
      </section>

      <dl className="identity-id-grid">
        <div><dt>User principal name</dt><dd>{principal.userPrincipalName || "Not present in this snapshot"}</dd></div>
        <div><dt>AD object GUID</dt><dd>{principal.objectGuid || "Not captured"}</dd></div>
        <div><dt>Security identifier</dt><dd>{principal.objectSid || "Not captured"}</dd></div>
      </dl>

      <div className="identity-detail-grid">
        <section className="identity-subsection">
          <h4>Directory signals</h4>
          <dl className="identity-signal-list">
            <div>
              <dt>Last replicated logon</dt>
              <dd>{principal.lastLogonDate
                ? `${formatRelativeDays(principal.lastLogonDate, capturedAt)} · ${formatDate(principal.lastLogonDate, { withTime: true })}`
                : "No timestamp returned"}</dd>
            </div>
            <div><dt>Password never expires</dt><dd>{signalValue(principal.passwordNeverExpires)}</dd></div>
            <div><dt>Trusted for delegation</dt><dd>{signalValue(principal.trustedForDelegation)}</dd></div>
            <div><dt>Protected from delegation</dt><dd>{signalValue(principal.accountNotDelegated)}</dd></div>
            <div><dt>AdminCount flag</dt><dd>{signalValue(principal.adminCount)}</dd></div>
          </dl>
          {principal.servicePrincipalNames?.length > 0 && (
            <div className="identity-spns">
              <h5>Service principal names</h5>
              <ul>{principal.servicePrincipalNames.map((name) => <li key={name}>{name}</li>)}</ul>
            </div>
          )}
        </section>

        <section className="identity-subsection">
          <h4>Effective membership in collected groups</h4>
          {memberships.length ? (
            <ul className="identity-memberships">
              {memberships.map((group) => (
                <li key={`${group.scope || principal.domain}:${group.name}`}>
                  <strong>{group.name}</strong><span>{group.scope || principal.domain}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="identity-empty">No membership in the selected privileged groups was returned. Check collection warnings and scope.</p>
          )}
          <p className="identity-limit">Membership matches require an AD object GUID or SID. Older snapshots without member identifiers cannot establish profile membership. The collector does not retain every nested-group hop.</p>
        </section>
      </div>

      <section className="identity-subsection identity-related">
        <h4>Related review signals <span>{relatedFindings.length}</span></h4>
        {relatedFindings.length ? (
          <div className="identity-finding-list">
            {relatedFindings.map((finding) => (
              <div key={finding.id}>
                <FindingButton finding={finding} onSelect={onSelectFinding} />
                <SeverityBadge severity={finding.severity} />
              </div>
            ))}
          </div>
        ) : <p className="identity-empty">No generated finding is linked to this account in the current snapshot.</p>}
      </section>
    </section>
  );
}

function DirectoryView({ principals, search, onSearch, accountFilter, onAccountFilter, snapshot, findings, selectedPrincipalKey, onSelectPrincipal, onSelectFinding }) {
  const [page, setPage] = useState(0);
  const pageSize = 100;
  const pageCount = Math.max(1, Math.ceil(principals.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const displayedPrincipals = principals.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const filters = [["all", "All accounts"], ["enabled", "Enabled"], ["disabled", "Disabled"]];
  return (
    <>
      <section className="panel register-panel">
        <div className="panel-heading register-heading">
          <div>
            <div className="section-kicker">OBJECT INVENTORY</div>
            <h2>Users and computers</h2>
            <p>Account identifiers come from the selected snapshot and remain local to this browser tab.</p>
          </div>
          <div className="register-count">{principals.length} shown</div>
        </div>
        <div className="filter-toolbar">
          <Input
            className="search-input"
            contentBefore={<Search24Regular />}
            placeholder="Search account, domain, or SPN"
            value={search}
            onChange={(_, data) => { setPage(0); onSearch(data.value); }}
            aria-label="Search directory principals"
          />
          <div className="filter-pills" role="group" aria-label="Filter accounts by status">
            {filters.map(([value, label]) => (
              <Button key={value} size="small" appearance={accountFilter === value ? "primary" : "subtle"} onClick={() => { setPage(0); onAccountFilter(value); }} aria-pressed={accountFilter === value}>
                {label}
              </Button>
            ))}
          </div>
        </div>
        {principals.length ? (
          <div className="table-scroll">
            <table className="data-table directory-table">
              <thead><tr><th scope="col">Account</th><th scope="col">Type</th><th scope="col">State</th><th scope="col">Last replicated logon</th><th scope="col">Review flags</th></tr></thead>
              <tbody>
                {displayedPrincipals.map((principal, index) => {
                  const flags = [];
                  if (principal.trustedForDelegation) flags.push("Delegation");
                  if (principal.passwordNeverExpires) flags.push("Never expires");
                  if (principal.servicePrincipalNames?.length) flags.push(`${principal.servicePrincipalNames.length} SPN`);
                  const key = principalKey(principal);
                  const isSelected = selectedPrincipalKey === key;
                  const domain = snapshot.domains.find((item) => item.name === principal.domain);
                  return (
                    <Fragment key={`${key}-${index}`}>
                      <tr className={isSelected ? "is-selected" : undefined}>
                        <td data-label="Account">
                          <button
                            type="button"
                            className="account-name-button"
                            onClick={() => onSelectPrincipal(principal)}
                            aria-expanded={isSelected}
                            aria-controls={isSelected ? `account-profile-${index}` : undefined}
                          >
                            <span className="account-name">{principal.accountName || "Unnamed principal"}</span>
                            <span className="cell-subtext">{principal.domain}</span>
                          </button>
                        </td>
                        <td data-label="Type">{principal.objectClass || "Unknown"}</td>
                        <td data-label="State"><AccountStatus enabled={principal.enabled} /></td>
                        <td data-label="Last replicated logon"><span title={principal.lastLogonDate || "No timestamp"}>{formatRelativeDays(principal.lastLogonDate, snapshot.capturedAt)}</span></td>
                        <td data-label="Review flags">{flags.length ? <span className="flag-list">{flags.map((flag) => <span className="flag-chip" key={flag}>{flag}</span>)}</span> : <span className="muted-cell">No listed flags</span>}</td>
                      </tr>
                      {isSelected && (
                        <tr className="identity-detail-row">
                          <td colSpan="5">
                            <IdentityProfile
                              id={`account-profile-${index}`}
                              principal={principal}
                              domain={domain}
                              capturedAt={snapshot.capturedAt}
                              findings={findings}
                              evidenceSources={snapshot.evidenceSources}
                              onClose={() => onSelectPrincipal(null)}
                              onSelectFinding={onSelectFinding}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state compact-empty"><strong>No accounts match this view</strong><span>Clear the search or change the account state filter.</span></div>
        )}
      </section>

      {principals.length > pageSize && <nav className="table-pagination" aria-label="Directory pages">
        <Button appearance="secondary" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous accounts</Button>
        <span>Accounts {currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, principals.length)} of {principals.length}</span>
        <Button appearance="secondary" disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}>Next accounts</Button>
      </nav>}

      <section className="inventory-lower-grid">
        {snapshot.domains.map((domain) => (
          <div className="inventory-domain" key={domain.name}>
            <Card className="panel inventory-card">
              <div className="section-kicker">DOMAIN CONTROLLERS</div>
              <h2>{domain.name}</h2>
              {domain.domainControllers?.length ? (
                <ul className="dc-list">
                  {domain.domainControllers.map((dc) => <li key={dc.hostName}><strong>{dc.hostName}</strong><span>{dc.site || "Site not returned"} · {dc.operatingSystem || "OS not returned"}</span></li>)}
                </ul>
              ) : <p className="muted-cell">No domain controllers were returned for this domain.</p>}
            </Card>
            <Card className="panel inventory-card">
              <div className="section-kicker">DOMAIN POLICY CONTEXT</div>
              <h2>Password policy · {domain.name}</h2>
              {domain.passwordPolicy ? (
                <div className="policy-grid">
                  <div><span>Minimum length</span><strong>{domain.passwordPolicy.minPasswordLength ?? "Not returned"}</strong></div>
                  <div><span>Maximum age</span><strong>{domain.passwordPolicy.maxPasswordAgeDays == null ? "Not returned" : `${domain.passwordPolicy.maxPasswordAgeDays} days`}</strong></div>
                  <div><span>Password history</span><strong>{domain.passwordPolicy.passwordHistoryCount ?? "Not returned"}</strong></div>
                  <div><span>Lockout threshold</span><strong>{domain.passwordPolicy.lockoutThreshold ?? "Not returned"}</strong></div>
                </div>
              ) : <p className="muted-cell">Default policy values were not returned for this domain.</p>}
              <p className="footprint-note">Observed settings only. Compare them with approved policy for this domain.</p>
            </Card>
          </div>
        ))}
      </section>
    </>
  );
}

export default App;

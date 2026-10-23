import { useMemo, useRef, useState } from "react";
import { Badge, Button, Card, Input, MessageBar, MessageBarBody } from "@fluentui/react-components";
import { ArrowDownload24Regular, ShieldCheckmark24Regular } from "@fluentui/react-icons";
import { formatDate } from "../domain/snapshot.js";
import { compareWorkspaceSnapshots, explainSignIn } from "../domain/workspace.js";
import { createReviewPlan, REVIEW_TEMPLATES } from "../domain/reviewPlans.js";
import { matchesEntraIdentity, sameTenant } from "../domain/identity.js";

const sourceCount = (source, key) => {
  const status = source?.collectionStatus?.[key];
  if (!source || status === "not-selected") return "Not collected";
  if (status === "failed") return "Failed";
  return `${Array.isArray(source[key]) ? source[key].length : 0}${status === "partial" ? "+ (partial)" : ""}`;
};

function SourceStatus({ label, status, color = "subtle" }) {
  return <div className="source-status-row"><span>{label}</span><Badge appearance="outline" color={color}>{status}</Badge></div>;
}

function cloudStatus(source) {
  if (!source) return "Not collected";
  if (source.sourceMode === "synthetic") return "Synthetic data";
  const selected = Object.values(source.collectionStatus || {}).filter((status) => status !== "not-selected");
  if (selected.length && selected.every((status) => status === "failed")) return "Collection failed";
  if (source.collectionWarnings?.length) return "Partial snapshot";
  return source.sourceMode === "imported" ? "Imported snapshot" : "Connected snapshot";
}

export function SourcesView({
  snapshot,
  datasetLabel,
  onDownloadCollector,
  onExportSnapshot,
  onConnect,
  onClearCloud,
  isConnecting,
  connectorError,
}) {
  const [tenantId, setTenantId] = useState("");
  const [clientId, setClientId] = useState("");
  const [includeDirectory, setIncludeDirectory] = useState(true);
  const [includeAccountDetails, setIncludeAccountDetails] = useState(false);
  const [includeActivity, setIncludeActivity] = useState(false);
  const [includeAccess, setIncludeAccess] = useState(false);
  const [includeIntune, setIncludeIntune] = useState(false);
  const [activityDays, setActivityDays] = useState("30");
  const entra = snapshot.evidenceSources?.entra;
  const intune = snapshot.evidenceSources?.intune;
  const isDemo = snapshot.adSourceMode === "synthetic";
  const forestDomains = Array.isArray(snapshot.forest?.domains) ? snapshot.forest.domains.length : snapshot.domains.length;
  const includedDomains = Array.isArray(snapshot.collector?.includedDomains)
    ? snapshot.collector.includedDomains
    : snapshot.domains.map((domain) => domain.name);

  return (
    <div className="sources-layout enterprise-sources-layout">
      <section className="panel sources-panel">
        <div className="sources-heading">
          <div>
            <h2>Evidence sources</h2>
            <p>Each adapter is opt-in and read-only. Connector results are held in this browser session and included only when you export a workspace snapshot.</p>
          </div>
        </div>
        <div className="source-status-list" aria-label="Enterprise evidence sources">
          <SourceStatus label="Active Directory Domain Services" status={!snapshot.domains.length ? "Not collected" : isDemo ? "Synthetic data" : snapshot.collectionWarnings?.length ? "Snapshot with warnings" : "Snapshot loaded"} color={snapshot.collectionWarnings?.length ? "warning" : snapshot.domains.length ? "success" : "subtle"} />
          <SourceStatus label="Microsoft Entra ID" status={cloudStatus(entra)} color={entra?.collectionWarnings?.length ? "warning" : entra ? "success" : "subtle"} />
          <SourceStatus label="Intune managed devices" status={cloudStatus(intune)} color={intune?.collectionWarnings?.length ? "warning" : intune ? "success" : "subtle"} />
          <SourceStatus label="HR and asset records" status="Not connected" />
        </div>

        <div className="connector-setup">
          <div className="section-kicker">OPTIONAL MICROSOFT GRAPH CONNECTOR</div>
          <h3>Connect a tenant for a read-only collection</h3>
          <p>Register a Single-page application in Microsoft Entra with <code>{new URL("redirect.html", window.location.href).href}</code> as its redirect URI. Enter its public application ID and the tenant ID here; neither value is saved. Live collection replaces synthetic evidence and removes cloud sources from other tenants.</p>
          {connectorError && <MessageBar intent="error" className="import-message"><MessageBarBody>{connectorError}</MessageBarBody></MessageBar>}
          {entra?.collectionWarnings?.length > 0 && (
            <MessageBar intent="warning" className="import-message">
              <MessageBarBody>{entra.collectionWarnings.join(" ")}</MessageBarBody>
            </MessageBar>
          )}
          {intune?.collectionWarnings?.length > 0 && (
            <MessageBar intent="warning" className="import-message">
              <MessageBarBody>{intune.collectionWarnings.join(" ")}</MessageBarBody>
            </MessageBar>
          )}
          <div className="connector-fields">
            <label>Tenant ID or verified tenant domain
              <Input value={tenantId} onChange={(_, data) => setTenantId(data.value)} placeholder="00000000-0000-0000-0000-000000000000" autoComplete="off" />
            </label>
            <label>Application (client) ID
              <Input value={clientId} onChange={(_, data) => setClientId(data.value)} placeholder="00000000-0000-0000-0000-000000000000" autoComplete="off" />
            </label>
          </div>
          <fieldset className="connector-options">
            <legend>Select evidence to collect</legend>
            <label><input type="checkbox" checked={includeDirectory || includeAccess} disabled={includeAccess} onChange={(event) => setIncludeDirectory(event.target.checked)} /> Entra users, groups, and active directory roles</label>
            <label><input type="checkbox" checked={includeAccountDetails} disabled={!includeDirectory} onChange={(event) => setIncludeAccountDetails(event.target.checked)} /> Include account state and additional profile fields (User.Read.All; broader read scope)</label>
            <label><input type="checkbox" checked={includeActivity} onChange={(event) => setIncludeActivity(event.target.checked)} /> Sign-in and directory audit logs</label>
            <label><input type="checkbox" checked={includeAccess} onChange={(event) => { setIncludeAccess(event.target.checked); if (event.target.checked) setIncludeDirectory(true); }} /> Access relationships: direct group edges, active role assignments and app-role assignments (adds Application.Read.All)</label>
            {includeAccess && <p>Collects up to 100 groups, 50 enterprise apps and 20,000 edges per relationship type. Nested paths are reconstructed locally; hidden memberships and PIM eligibility are excluded. Collection can take several minutes. Clear cloud data to cancel it.</p>}
            {includeActivity && (
              <label className="activity-days-select">Recent activity window
                <select value={activityDays} onChange={(event) => setActivityDays(event.target.value)}>
                  <option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option>
                </select>
              </label>
            )}
            <label><input type="checkbox" checked={includeIntune} onChange={(event) => setIncludeIntune(event.target.checked)} /> Intune managed-device inventory</label>
          </fieldset>
          <div className="connector-actions">
            <Button
              appearance="primary"
              disabled={isConnecting || !tenantId.trim() || !clientId.trim() || (!includeDirectory && !includeActivity && !includeIntune && !includeAccess)}
              onClick={() => onConnect({ tenantId: tenantId.trim(), clientId: clientId.trim(), includeDirectory: includeDirectory || includeAccess, includeAccountDetails, includeActivity, includeIntune, includeAccess, activityDays: Number(activityDays) })}
            >
              {isConnecting ? "Connecting and collecting…" : "Sign in and collect selected evidence"}
            </Button>
            <Button appearance="secondary" onClick={onExportSnapshot}>Export workspace snapshot</Button>
            {(entra || intune) && <Button appearance="subtle" onClick={onClearCloud}>Clear collected cloud data</Button>}
          </div>
          <div className="connector-permissions">
            <strong>Scopes used when each source is selected</strong>
            <span>Directory: User.ReadBasic.All, Group.Read.All, RoleManagement.Read.Directory</span>
            <span>Optional account details: User.Read.All (wider read scope; admin consent is typically required)</span>
            <span>Activity: AuditLog.Read.All · Intune: DeviceManagementManagedDevices.Read.All</span>
            <span>No write permission is requested. Your administrator may need to grant delegated consent.</span>
          </div>
          <p className="source-privacy-note">MSAL uses its in-memory token cache. Reloading the page clears KingIdentity's token cache and collected records; Microsoft may still have a browser SSO session. The app has no API server or telemetry.</p>
          <p className="source-privacy-note">This build calls the global Microsoft Graph v1.0 endpoint. Other national cloud endpoints are not wired yet.</p>
          <p className="source-privacy-note">Entra group inventory includes group properties only. Group membership paths and user-to-role assignments are not collected in this version.</p>
        </div>

        <div className="source-collection">
          <div>
            <h3>Collect an AD DS snapshot</h3>
            <p>Run the PowerShell collector on an approved Windows admin workstation. It uses your current identity and writes a local JSON file.</p>
          </div>
          <div className="code-block" role="region" aria-label="PowerShell collection command">
            <code>pwsh -File .\collectors\Collect-ADDS.ps1 `</code>
            <code>&nbsp;&nbsp;-OutputPath C:\Audit\identity-snapshot.json `</code>
            <code>&nbsp;&nbsp;-InactiveAccountDays 90</code>
          </div>
          <p className="source-scope-note">To limit collection size, add <code>-Domain contoso.com</code>. Multiple forest DNS names can be supplied as a comma-separated list.</p>
          <p className="source-scope-note">For direct AD group edges and locally reconstructed nested paths, add <code>-IncludeAccessMemberships</code>. This optional pass reads up to 200 groups per domain (override with <code>-MaxAccessGroups</code>) and retains at most 20,000 membership edges per domain. Primary groups, SID history, trusts and resource ACLs are not collected.</p>
          <div className="collection-actions">
            <Button appearance="secondary" icon={<ArrowDownload24Regular />} onClick={onDownloadCollector}>Download PowerShell collector</Button>
            <Button appearance="secondary" onClick={() => window.print()}>Print source notes</Button>
          </div>
        </div>
      </section>

      <aside className="panel sources-summary">
        <h2>Snapshot coverage</h2>
        <dl className="coverage-details">
          <div><dt>AD domains returned</dt><dd>{snapshot.domains.length} / {forestDomains}</dd></div>
          <div><dt>AD collection warnings</dt><dd>{snapshot.collectionWarnings?.length || 0}</dd></div>
          <div><dt>Entra users / groups / roles</dt><dd>{sourceCount(entra, "users")} / {sourceCount(entra, "groups")} / {sourceCount(entra, "directoryRoles")}</dd></div>
          <div><dt>Entra sign-ins / audits</dt><dd>{sourceCount(entra, "signIns")} / {sourceCount(entra, "directoryAudits")}</dd></div>
          <div><dt>Intune devices</dt><dd>{sourceCount(intune, "devices")}</dd></div>
          <div><dt>AD snapshot captured</dt><dd>{formatDate(snapshot.capturedAt, { withTime: true })}</dd></div>
          {entra?.capturedAt && <div><dt>Entra snapshot captured</dt><dd>{formatDate(entra.capturedAt, { withTime: true })}</dd></div>}
          {intune?.capturedAt && <div><dt>Intune snapshot captured</dt><dd>{formatDate(intune.capturedAt, { withTime: true })}</dd></div>}
        </dl>
        <div className="coverage-scope"><h3>Included AD domains</h3><ul>{includedDomains.map((name) => <li key={name}>{name}</li>)}</ul></div>
        <p className="source-privacy-note">Sign-in history depends on tenant log retention and permissions. Intune reads require an active Intune license. Missing source records are not evidence that no access or device exists.</p>
      </aside>
    </div>
  );
}

export function AccessInvestigationView({ snapshot, principals }) {
  const users = snapshot.evidenceSources?.entra?.users || [];
  const events = snapshot.evidenceSources?.entra?.signIns || [];
  const devices = snapshot.evidenceSources?.intune?.devices || [];
  const [userId, setUserId] = useState("");
  const [signInId, setSignInId] = useState("");
  const selectedUser = users.find((user) => user.id === userId) || null;
  const userEvents = useMemo(() => events.filter((event) => matchesEntraIdentity(event, selectedUser)), [events, selectedUser]);
  const selectedSignIn = userEvents.find((event) => event.id === signInId) || userEvents[0] || null;
  const signInPoints = explainSignIn(selectedSignIn, selectedUser);
  const upn = selectedUser?.userPrincipalName?.trim().toLocaleLowerCase();
  const adMatches = upn ? principals.filter((principal) => (principal.userPrincipalName || "").trim().toLocaleLowerCase() === upn) : [];
  const userDevices = devices.filter((device) =>
    sameTenant(snapshot.evidenceSources?.entra, snapshot.evidenceSources?.intune) && matchesEntraIdentity(device, selectedUser)
  );

  return (
    <section className="panel access-investigation">
      <div className="panel-heading">
        <div><div className="section-kicker">ACCESS TROUBLESHOOTING</div><h2>Explain a sign-in result</h2><p>Evidence summary from the selected Entra snapshot; it does not diagnose causes beyond what Microsoft returned.</p></div>
      </div>
      {!users.length || !events.length ? (
        <div className="empty-state compact-empty"><ShieldCheckmark24Regular /><strong>Entra sign-in evidence is not available</strong><span>Connect the Entra source with the activity-log option selected. The synthetic demo includes sample events.</span></div>
      ) : (
        <>
          <div className="investigation-selectors">
            <label>Person
              <select value={userId} onChange={(event) => { setUserId(event.target.value); setSignInId(""); }}>
                <option value="">Choose an Entra user</option>
                {users.map((user) => <option key={user.id} value={user.id}>{user.displayName || user.userPrincipalName || user.id}{user.userPrincipalName ? ` · ${user.userPrincipalName}` : ""}</option>)}
              </select>
            </label>
            <label>Sign-in event
              <select value={selectedSignIn?.id || ""} onChange={(event) => setSignInId(event.target.value)} disabled={!userEvents.length}>
                {!userEvents.length && <option value="">No matching sign-ins</option>}
                {userEvents.map((event) => <option key={event.id} value={event.id}>{formatDate(event.createdDateTime, { withTime: true })} · {event.appDisplayName || "Unknown app"} · {event.status?.errorCode === 0 ? "Success" : `Error ${event.status?.errorCode ?? "unknown"}`}</option>)}
              </select>
            </label>
          </div>
          {selectedUser && (
            <div className="investigation-context">
              <div className="investigation-facts">
                <div><span>Entra account</span><strong>{selectedUser.accountEnabled == null ? "State not returned" : selectedUser.accountEnabled ? "Enabled" : "Disabled"}</strong></div>
                <div><span>Matching AD principal</span><strong>{adMatches.length === 1 ? `${adMatches[0].accountName} · exact UPN` : adMatches.length > 1 ? "Ambiguous exact UPN match" : "No exact UPN match"}</strong></div>
                <div><span>Related Intune devices</span><strong>{userDevices.length}</strong></div>
              </div>
              {selectedSignIn ? (
                <>
                  <h3>{selectedSignIn.appDisplayName || "Unknown application"} <span>·</span> {formatDate(selectedSignIn.createdDateTime, { withTime: true })}</h3>
                  <p className="investigation-record">Resource: {selectedSignIn.resourceDisplayName || "Not returned"} · Result: {selectedSignIn.status?.errorCode === 0 ? "Success" : `Error ${selectedSignIn.status?.errorCode ?? "not returned"}`} · Conditional Access: {selectedSignIn.conditionalAccessStatus || "Not returned"}</p>
                  <div className="evidence-points">
                    {signInPoints.map((point, index) => <div className={`evidence-point evidence-${point.kind}`} key={`${point.kind}-${index}`}><Badge appearance="outline" color={point.kind === "limit" ? "warning" : "informative"}>{point.kind === "limit" ? "Limit" : "Observed"}</Badge><span>{point.text}</span></div>)}
                  </div>
                  {userDevices.length > 0 && (
                    <div className="related-devices">
                      <h3>Device context from Intune</h3>
                      {userDevices.slice(0, 10).map((device) => <div key={device.id}><strong>{device.deviceName || device.id}</strong><span>{device.complianceState || "Compliance not returned"} · {device.operatingSystem || "OS not returned"} · last sync {formatDate(device.lastSyncDateTime)}</span></div>)}
                    </div>
                  )}
                </>
              ) : <p className="identity-empty">No sign-in event matches this Entra user in the captured activity window.</p>}
            </div>
          )}
          <p className="source-privacy-note">Events may be missing because of retention, licensing, permissions, collection date range, or API result limits. Applied Conditional Access policy details may require additional read permission; KingIdentity does not request that permission in this build.</p>
        </>
      )}
    </section>
  );
}

const statusMeta = {
  added: { label: "Added", color: "success" },
  changed: { label: "Changed", color: "warning" },
  "not-returned": { label: "Not returned", color: "subtle" },
};

function ChangeList({ collection }) {
  if (!collection.comparable) return <p className="identity-empty">{collection.reason}</p>;
  return (
    <>
      <div className="change-counts"><span>{collection.added} added</span><span>{collection.changed} changed</span><span>{collection.removed} not returned</span></div>
      {collection.entries.length > 0 && (
        <div className="change-list">
          {collection.entries.map((entry, index) => {
            const meta = statusMeta[entry.type];
            return <div className="change-row" key={`${entry.type}-${entry.name}-${index}`}>
              <div className="change-row-heading"><strong>{entry.name}</strong><Badge appearance="outline" color={meta.color}>{meta.label}</Badge></div>
              <span className="change-scope">{entry.scope} · matched by {entry.matchQuality}</span>
              {entry.details.map((detail) => <span className="change-detail" key={detail.field}>{detail.field}: {detail.before} → {detail.after}</span>)}
            </div>;
          })}
        </div>
      )}
      {collection.hiddenEntries > 0 && <p className="source-privacy-note">Showing the first {collection.entries.length} of {collection.added + collection.changed + collection.removed} changes.</p>}
      <p className="source-privacy-note">{collection.reason}</p>
    </>
  );
}

export function CompareView({ current, baseline, onBaseline, onClearBaseline, importError }) {
  const inputRef = useRef(null);
  const comparisons = useMemo(() => baseline ? compareWorkspaceSnapshots(current, baseline) : [], [current, baseline]);
  return (
    <div className="compare-workspace">
      <section className="panel compare-intro">
        <div className="section-kicker">CHANGE REVIEW</div><h2>Compare workspace snapshots</h2>
        <p>Import an earlier KingIdentity snapshot to review inventory changes. Stable source IDs are preferred; objects without them use a visible fallback. “Not returned” does not prove deletion.</p>
        <input ref={inputRef} className="visually-hidden" type="file" accept="application/json,.json" aria-label="Choose earlier KingIdentity snapshot" onChange={onBaseline} />
        <div className="connector-actions">
          <Button appearance="secondary" onClick={() => inputRef.current?.click()}>Import earlier snapshot</Button>
          {baseline && <Button appearance="subtle" onClick={onClearBaseline}>Clear comparison</Button>}
        </div>
        {importError && <MessageBar intent="error" className="import-message"><MessageBarBody>{importError}</MessageBarBody></MessageBar>}
        {baseline && <p className="baseline-context">Comparing current capture ({formatDate(current.capturedAt, { withTime: true })}) with earlier capture ({formatDate(baseline.capturedAt, { withTime: true })}).</p>}
      </section>
      {baseline ? (
        <div className="change-source-grid">
          {comparisons.map((collection) => <Card className="panel change-source-card" key={collection.key}><h3>{collection.label}</h3><ChangeList collection={collection} /></Card>)}
        </div>
      ) : <div className="empty-state compact-empty"><strong>Choose an earlier snapshot to begin</strong><span>Use an exported KingIdentity workspace snapshot; the current session remains unchanged.</span></div>}
    </div>
  );
}

function downloadJson(name, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function TasksView({ snapshot, subjects }) {
  const [templateId, setTemplateId] = useState(REVIEW_TEMPLATES[0].id);
  const [subjectKey, setSubjectKey] = useState("");
  const [plan, setPlan] = useState(null);
  const template = REVIEW_TEMPLATES.find((item) => item.id === templateId) || REVIEW_TEMPLATES[0];
  const subject = subjects.find((item) => item.key === subjectKey)?.record || null;
  const completionCount = plan?.steps.filter((step) => step.complete).length || 0;

  function createPlan() {
    setPlan(createReviewPlan(template, subject, snapshot.evidenceSources || {}));
  }

  function toggleStep(stepId) {
    setPlan((current) => current ? {
      ...current,
      steps: current.steps.map((step) => step.id === stepId ? { ...step, complete: !step.complete } : step),
    } : current);
  }

  return (
    <div className="task-workspace">
      <section className="panel task-builder">
        <div className="section-kicker">GUIDED REVIEW</div><h2>Prepare a review plan</h2>
        <p>Build a local checklist from current evidence. Plans do not change accounts, group memberships, policies, or devices.</p>
        <div className="investigation-selectors">
          <label>Workflow
            <select value={templateId} onChange={(event) => { setTemplateId(event.target.value); setPlan(null); }}>
              {REVIEW_TEMPLATES.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </label>
          <label>Identity (optional)
            <select value={subjectKey} onChange={(event) => { setSubjectKey(event.target.value); setPlan(null); }}>
              <option value="">No identity selected</option>
              {subjects.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </label>
        </div>
        <p className="task-template-summary">{template.summary}</p>
        <Button appearance="primary" onClick={createPlan}>Create review plan</Button>
      </section>
      {plan && (
        <section className="panel task-plan">
          <div className="panel-heading"><div><div className="section-kicker">DRAFT · LOCAL ONLY</div><h2>{plan.title}</h2><p>{plan.subject ? `${plan.subject.name}${plan.subject.userPrincipalName ? ` · ${plan.subject.userPrincipalName}` : ""}` : "No identity selected"}</p></div><Badge appearance="outline" color="informative">{completionCount} / {plan.steps.length} checked</Badge></div>
          <div className="plan-next-step"><strong>Proposed next step</strong><span>{plan.proposedNextStep}</span></div>
          {plan.affectedObjects.length > 0 && <div className="plan-evidence"><strong>Affected object</strong><span>{plan.affectedObjects.map((item) => `${item.name} · ${item.source}${item.objectId ? ` · ID ${item.objectId}` : ""}`).join("; ")}</span></div>}
          {plan.evidenceSources.length > 0 && <div className="plan-evidence">Evidence context: {plan.evidenceSources.join(" · ")}</div>}
          <div className="plan-detail-grid">
            <section><h3>Prerequisites</h3><ul>{plan.prerequisites.map((item) => <li key={item}>{item}</li>)}</ul></section>
            <section><h3>Verification after approved changes</h3><ul>{plan.verificationSteps.map((item) => <li key={item}>{item}</li>)}</ul></section>
          </div>
          <ol className="plan-steps">{plan.steps.map((step) => <li key={step.id}><label><input type="checkbox" checked={step.complete} onChange={() => toggleStep(step.id)} /><span>{step.description}</span></label></li>)}</ol>
          <div className="task-plan-footer"><strong>{plan.execution}</strong><Button appearance="secondary" onClick={() => downloadJson("kingidentity-review-plan.json", plan)}>Export plan JSON</Button></div>
        </section>
      )}
      <MessageBar intent="info"><MessageBarBody>Execution support is intentionally not connected. No write permission or tenant-changing API is present. A later action feature would need a separate permission review, exact change preview, per-action confirmation, operator identity, audit record, and read-back verification.</MessageBarBody></MessageBar>
    </div>
  );
}

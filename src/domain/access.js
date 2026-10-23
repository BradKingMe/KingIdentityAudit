import { matchesEntraIdentity, sameTenant } from './identity.js';

const norm = value => String(value || '').trim().toLowerCase();
export const adId = row => row?.objectGuid ? `ad-guid:${norm(row.objectGuid)}` : row?.objectSid ? `ad-sid:${norm(row.objectSid)}` : null;
const userName = row => row.displayName || row.accountName || row.userPrincipalName || row.id;

export function accessSubjects(snapshot) {
  const cloud = snapshot.evidenceSources?.entra?.users || [];
  const ad = snapshot.domains.flatMap(domain => domain.principals.filter(p => p.objectClass === 'user').map(p => ({ ...p, domain: domain.name })));
  const subjects = cloud.map(user => ({ key: `entra:${norm(user.id)}`, source: 'Entra ID', name: userName(user), upn: user.userPrincipalName || '', user }));
  for (const principal of ad) if (adId(principal)) subjects.push({ key: adId(principal), source: 'AD DS', name: userName(principal), upn: principal.userPrincipalName || '', principal });
  return subjects;
}

// Reconstruct paths from direct edges only. A per-path visited set preserves
// alternative routes; queue/depth/path bounds prevent cyclic or dense graphs freezing UI.
function membershipPaths(start, groups, edges) {
  const names = new Map(groups.map(group => [norm(group.id), group.displayName || group.id]));
  const parents = new Map();
  for (const edge of edges) {
    const key = norm(edge.memberId);
    if (!parents.has(key)) parents.set(key, new Set());
    parents.get(key).add(norm(edge.groupId));
  }
  const queue = [[norm(start)]];
  const paths = [];
  let cursor = 0;
  let bounded = false;
  while (cursor < queue.length && cursor < 4000 && paths.length < 500) {
    const path = queue[cursor++];
    const next = parents.get(path.at(-1)) || [];
    for (const id of next) {
      if (path.includes(id)) { bounded = true; continue; }
      if (path.length >= 13 || queue.length >= 4000 || paths.length >= 500) { bounded = true; continue; }
      const chain = [...path, id];
      paths.push({ ids: chain, labels: chain.slice(1).map(key => names.get(key) || `Unresolved group ${key}`) });
      queue.push(chain);
    }
  }
  return { paths, bounded: bounded || cursor < queue.length };
}

export function buildAccessProfile(snapshot, subject, confirmHybrid = false) {
  const entra = snapshot.evidenceSources?.entra;
  const users = entra?.users || [];
  const ad = snapshot.domains.flatMap(domain => domain.principals.map(principal => ({ ...principal, domain: domain.name })));
  const candidateMatches = subject.user
    ? ad.filter(p => subject.upn && norm(p.userPrincipalName) === norm(subject.upn))
    : users.filter(user => subject.upn && norm(user.userPrincipalName) === norm(subject.upn));
  const candidate = candidateMatches.length === 1 ? candidateMatches[0] : null;
  const user = subject.user || (confirmHybrid ? candidate : null);
  const principal = subject.principal || (confirmHybrid ? candidate : null);
  const entitlements = [];
  const coverage = [];
  const warnings = [];
  const addCoverage = (source, key, status, timestamp) => coverage.push({ source, key, status: status || 'not-collected', capturedAt: timestamp || null });
  function addGroups(source, start, groups, edges, capturedAt) {
    const graph = membershipPaths(start, groups, edges);
    if (graph.bounded) warnings.push(`${source}: path exploration reached a limit or cycle; not every route is shown.`);
    for (const path of graph.paths) entitlements.push({
      id: `${source}:group:${path.ids.join('>')}`, kind: 'Group', source,
      label: path.labels.at(-1), path: [subject.name, ...path.labels], objectIds: path.ids,
      basis: path.ids.length === 2 ? 'Direct membership' : 'Nested membership', capturedAt,
      limitation: 'Membership is recorded evidence, not proof of effective resource authorization.',
    });
    return graph.paths;
  }
  if (principal) {
    const reports = snapshot.domains.map(d => d.accessEvidence).filter(Boolean);
    const groups = reports.flatMap(r => r.groups || []);
    const edges = reports.flatMap(r => r.groupMemberships || []);
    addGroups('AD DS', adId(principal), groups, edges, snapshot.capturedAt);
    for (const domain of snapshot.domains) addCoverage(`AD DS · ${domain.name}`, 'groupMemberships', domain.accessEvidence?.collectionStatus?.groupMemberships, snapshot.capturedAt);
    warnings.push('AD paths exclude primary-group membership, SID history, trusts, resource ACLs and token construction. Legacy recursive privileged-group inventory does not establish a nested path.');
    warnings.push(...(snapshot.collectionWarnings || []));
    for (const report of reports) warnings.push(...(report.collectionWarnings || []));
  }
  if (user && entra) {
    const paths = addGroups('Entra ID', user.id, entra.groups || [], entra.groupMemberships || [], entra.capturedAt);
    const directGroups = new Map(paths.filter(path => path.ids.length === 2).map(path => [path.ids[1], path]));
    const definitions = new Map((entra.roleDefinitions || []).map(role => [norm(role.id), role]));
    const applications = new Map((entra.applications || []).map(app => [norm(app.id), app]));
    for (const [kind, assignments] of [['Role', entra.roleAssignments || []], ['Application', entra.applicationAssignments || []]]) {
      for (const assignment of assignments) {
        const direct = norm(assignment.principalId) === norm(user.id);
        const groupPath = directGroups.get(norm(assignment.principalId));
        if (!direct && !groupPath) continue;
        const definition = definitions.get(norm(assignment.roleDefinitionId));
        const app = applications.get(norm(assignment.resourceId));
        const appRole = app?.appRoles?.find(role => norm(role.id) === norm(assignment.appRoleId));
        const label = kind === 'Role' ? definition?.displayName || `Role ${assignment.roleDefinitionId}` : `${app?.displayName || assignment.resourceDisplayName || assignment.resourceId} · ${appRole?.displayName || (norm(assignment.appRoleId) === '00000000-0000-0000-0000-000000000000' ? 'Default access' : `Role ${assignment.appRoleId}`)}`;
        entitlements.push({ id: `${kind}:${assignment.id}`, kind, source: 'Entra ID', label,
          path: [subject.name, ...(groupPath?.labels || []), label],
          objectIds: [user.id, ...(groupPath ? [assignment.principalId] : []), assignment.id],
          basis: direct ? 'Direct assignment' : 'Assignment to a direct group',
          scope: assignment.directoryScopeId || assignment.appScopeId || assignment.resourceId || 'Scope not returned',
          capturedAt: entra.capturedAt,
          limitation: kind === 'Role' ? 'Recorded active assignment only; PIM eligibility and activation history are not collected.' : 'Recorded app-role assignment; sign-in policies and app-local permissions can still deny or alter access. Nested group membership is not inherited.',
        });
      }
    }
    for (const key of ['users', 'groups', 'groupMemberships', 'roleDefinitions', 'roleAssignments', 'applications', 'applicationAssignments', 'signIns']) addCoverage('Entra ID', key, entra.collectionStatus?.[key], entra.capturedAt);
    warnings.push(...(entra.collectionWarnings || []), 'Entra membership collection does not read hidden memberships. App and role assignments are followed through direct groups only; nested group paths do not establish those grants.');
  }
  const intune = snapshot.evidenceSources?.intune;
  const devices = user && sameTenant(entra, intune) ? (intune?.devices || []).filter(device => matchesEntraIdentity(device, user)) : [];
  if (user) addCoverage('Intune', 'devices', sameTenant(entra, intune) ? intune?.collectionStatus?.devices : 'not-collected', intune?.capturedAt);
  const activity = user ? (entra?.signIns || []).filter(event => matchesEntraIdentity(event, user)).sort((a,b) => Date.parse(b.createdDateTime || 0) - Date.parse(a.createdDateTime || 0)).slice(0, 10) : [];
  return {
    subject: { key: subject.key, name: subject.name, source: subject.source, userPrincipalName: subject.upn,
      entraId: user?.id || null, adId: adId(principal), tenantId: user ? entra?.tenantId : null,
      forest: principal ? snapshot.forest?.name : null, hybridConfirmed: Boolean(confirmHybrid && candidate),
      accountEnabled: user ? user.accountEnabled ?? null : principal?.enabled ?? null },
    candidate: candidate ? { name: userName(candidate), id: subject.user ? adId(candidate) : candidate.id } : null,
    ambiguousCandidate: candidateMatches.length > 1,
    capturedAt: snapshot.capturedAt, synthetic: snapshot.adSourceMode === 'synthetic' || entra?.sourceMode === 'synthetic',
    entitlements, coverage, warnings: [...new Set(warnings)],
    devices: devices.map(d => ({ id:d.id, name:d.deviceName || d.id, compliance:d.complianceState, lastSync:d.lastSyncDateTime })),
    activity: activity.map(e => ({ id:e.id, app:e.appDisplayName, at:e.createdDateTime, code:e.status?.errorCode ?? null, conditionalAccess:e.conditionalAccessStatus })),
  };
}

export const REVIEW_TYPES = {
  access: { label: 'Access review', steps: ['Confirm identity and review scope with the owner.', 'Confirm business need for each recorded entitlement.', 'Resolve missing or partial source coverage.', 'Record owner approval and verify any separately applied changes.'] },
  joiner: { label: 'New hire', steps: ['Obtain an authoritative manager or HR request and start date.', 'Confirm required access with each resource owner.', 'Review unexpected existing assignments and device readiness.', 'Have authorized operators provision approved access and verify it.'] },
  mover: { label: 'Department transfer', steps: ['Confirm old and new manager, effective date and responsibilities.', 'Review old access for removal and new access for approval.', 'Check service dependencies and device ownership.', 'Verify approved changes and document retained exceptions.'] },
  leaver: { label: 'Offboarding', steps: ['Confirm authoritative HR approval, effective time and retention requirements.', 'Review accounts, roles, applications and service dependencies.', 'Confirm device return, legal holds and delegated ownership.', 'Have authorized operators apply approved changes and read back the results.'] },
};

export function createEmployeeReview(profile, type) {
  const template = REVIEW_TYPES[type];
  if (!template) throw new Error('Choose a supported review type.');
  const now = new Date().toISOString();
  return { format:'kingidentity.employee-review', version:1, id:crypto.randomUUID(), type,
    createdAt:now, updatedAt:now, owner:'', dueDate:'', notes:'', status:'open',
    evidence:JSON.parse(JSON.stringify(profile)),
    decisions:profile.entitlements.map(entry => ({ id:entry.id, decision:'unreviewed', reason:'' })),
    checklist:template.steps.map((description,index) => ({ id:`step-${index}`, description, complete:false })),
    execution:'Plan only. No directory, application or device changes have been executed.' };
}

export function parseEmployeeReview(text) {
  if (text.length > 10 * 1024 * 1024) throw new Error('Review packages must be 10 MB or smaller.');
  let review;
  try { review = JSON.parse(text); } catch { throw new Error('Choose a valid JSON review package.'); }
  const string = value => typeof value === 'string' && value.length <= 20000;
  const record = value => value && typeof value === 'object' && !Array.isArray(value);
  const list = (rows, limit, check) => Array.isArray(rows) && rows.length <= limit && rows.every(check);
  const nullableText = value => value == null || string(value);
  const nullableBoolean = value => value == null || typeof value === 'boolean';
  const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  const evidence = review?.evidence;
  if (!record(review) || review.format !== 'kingidentity.employee-review' || review.version !== 1 || !Object.hasOwn(REVIEW_TYPES, review.type) ||
    !['id','createdAt','updatedAt','owner','dueDate','notes'].every(k => string(review[k])) || !['open','in-review','closed'].includes(review.status) ||
    !record(evidence) || !record(evidence.subject) || !['key','name','source','userPrincipalName'].every(k => string(evidence.subject[k])) ||
    !timestamp(evidence.capturedAt) || typeof evidence.synthetic !== 'boolean' || !nullableBoolean(evidence.subject.accountEnabled) ||
    !['entraId','adId','tenantId','forest'].every(k=>nullableText(evidence.subject[k])) ||
    !list(evidence.entitlements, 20000, row => record(row) && ['id','kind','source','label','basis','limitation'].every(k=>string(row[k])) && nullableText(row.scope) && nullableText(row.capturedAt) && list(row.path,16,string) && list(row.objectIds,16,string)) ||
    !list(evidence.coverage,2000,row => record(row) && ['source','key','status'].every(k=>string(row[k])) && nullableText(row.capturedAt)) || !list(evidence.warnings,2000,string) ||
    !list(evidence.devices,20000,row => record(row) && string(row.id) && string(row.name) && nullableText(row.compliance) && nullableText(row.lastSync)) || !list(evidence.activity,10,row => record(row) && string(row.id) && nullableText(row.app) && nullableText(row.at) && nullableText(row.conditionalAccess) && (row.code == null || typeof row.code === 'number' && Number.isFinite(row.code))) ||
    !list(review.decisions,20000,row => record(row) && string(row.id) && ['unreviewed','retain','remove','investigate'].includes(row.decision) && string(row.reason)) ||
    !list(review.checklist,20,row => record(row) && string(row.id) && string(row.description) && typeof row.complete === 'boolean')) throw new Error('This file is not a supported employee review package.');
  if (new Set(evidence.entitlements.map(e=>e.id)).size !== evidence.entitlements.length || new Set(review.decisions.map(d=>d.id)).size !== review.decisions.length ||
    evidence.entitlements.length !== review.decisions.length || review.decisions.some(d=>!evidence.entitlements.some(e=>e.id===d.id))) throw new Error('The review decisions do not match the captured evidence.');
  if (!timestamp(review.createdAt) || !timestamp(review.updatedAt) || (review.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(review.dueDate)) || new Set(review.checklist.map(s=>s.id)).size !== review.checklist.length) throw new Error('The review contains invalid dates or checklist identifiers.');
  review.execution = 'Plan only. No directory, application or device changes have been executed.';
  return review;
}

export function employeeActionPlan(review) {
  const md = value => String(value ?? '').replace(/[\r\n]/g,' ').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/[\\`*_{}[\]()#+.!|~-]/g,'\\$&');
  const lines = [`# ${REVIEW_TYPES[review.type].label}: ${md(review.evidence.subject.name)}`, '', `Case: ${md(review.id)}`, `Owner: ${md(review.owner || 'Unassigned')}`, `Due: ${md(review.dueDate || 'Not set')}`, `Review status: ${md(review.status)}`, `Evidence captured: ${md(review.evidence.capturedAt)}`, `Subject: ${md(review.evidence.subject.key)}`, `Entra tenant: ${md(review.evidence.subject.tenantId || 'Not included')}`, `AD forest: ${md(review.evidence.subject.forest || 'Not included')}`, '', 'Plan only. No directory, application or device changes have been executed.', '', '## Decisions'];
  for (const entry of review.evidence.entitlements) {
    const decision = review.decisions.find(d=>d.id===entry.id);
    lines.push(`- ${md(decision?.decision || 'unreviewed')}: ${md(entry.label)} (${md(entry.source)}; ${md(entry.basis)})`, `  Path: ${entry.path.map(md).join(' > ')}`, `  IDs: ${entry.objectIds.map(md).join(' > ')}`, `  Reason: ${md(decision?.reason || 'Not recorded')}`);
  }
  lines.push('', '## Checklist', ...review.checklist.map(step=>`- [${step.complete?'x':' '}] ${md(step.description)}`), '', '## Notes', md(review.notes || 'None'), '', '## Coverage', ...review.evidence.coverage.map(c=>`- ${md(c.source)} / ${md(c.key)}: ${md(c.status)} (${md(c.capturedAt || 'timestamp unavailable')})`), '', '## Limitations', ...review.evidence.warnings.map(w=>`- ${md(w)}`), '', 'Operator-authored review; imported packages are not signed or independently verified.');
  return lines.join('\n');
}

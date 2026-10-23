import { fetchGraphCollection, graphQueryPath } from './graphClient.js';

export const ENTRA_ACCESS_SCOPES = ['Group.Read.All', 'RoleManagement.Read.Directory', 'Application.Read.All'];
const text = value => typeof value === 'string' ? value : null;

export async function collectAccessEvidence({ getToken, groups, groupsStatus, signal }) {
  const collectionStatus = {};
  const collectionWarnings = [];
  const groupCoverage = [];
  const applicationCoverage = [];
  const evidence = { groupMemberships:[], roleDefinitions:[], roleAssignments:[], applications:[], applicationAssignments:[], groupCoverage, applicationCoverage, collectionStatus, collectionWarnings };
  async function read(key, path, scopes, maxItems = 10000) {
    signal?.throwIfAborted();
    try {
      const token = await getToken(scopes);
      signal?.throwIfAborted();
      const result = await fetchGraphCollection(token,path,{ maxItems, signal });
      collectionStatus[key] = result.truncated ? 'partial' : 'complete';
      if (result.truncated) collectionWarnings.push(`${key}: collection reached its page/item limit.`);
      return result.records;
    } catch (error) {
      signal?.throwIfAborted();
      collectionStatus[key] = 'failed';
      collectionWarnings.push(`${key}: ${error instanceof Error ? error.message : 'Collection failed.'}`);
      return [];
    }
  }
  const [definitions, assignments, apps] = await Promise.all([
    read('roleDefinitions',graphQueryPath('roleManagement/directory/roleDefinitions',{'$select':'id,displayName'}),['RoleManagement.Read.Directory']),
    read('roleAssignments',graphQueryPath('roleManagement/directory/roleAssignments',{'$select':'id,principalId,roleDefinitionId,directoryScopeId,appScopeId'}),['RoleManagement.Read.Directory']),
    read('applications',graphQueryPath('servicePrincipals',{'$select':'id,displayName,appRoles','$top':'50'}),['Application.Read.All'],50),
  ]);
  evidence.roleDefinitions = definitions.filter(r=>text(r.id)).map(r=>({id:r.id,displayName:text(r.displayName)}));
  evidence.roleAssignments = assignments.filter(r=>text(r.id)&&text(r.principalId)&&text(r.roleDefinitionId)).map(r=>({id:r.id,principalId:r.principalId,roleDefinitionId:r.roleDefinitionId,directoryScopeId:text(r.directoryScopeId),appScopeId:text(r.appScopeId)}));
  evidence.applications = apps.filter(r=>text(r.id)).map(r=>({id:r.id,displayName:text(r.displayName),appRoles:(Array.isArray(r.appRoles)?r.appRoles:[]).filter(role=>text(role.id)).slice(0,1000).map(role=>({id:role.id,displayName:text(role.displayName),value:text(role.value)}))}));
  let groupPartial = groupsStatus !== 'complete' || groups.length > 100;
  for (const group of groups.slice(0,100)) {
    if (evidence.groupMemberships.length >= 20000) { groupPartial = true; break; }
    const key = `group:${group.id}`;
    const rows = await read(key,graphQueryPath(`groups/${encodeURIComponent(group.id)}/members`,{'$select':'id','$top':'999'}),['Group.Read.All'],Math.min(10000,20000-evidence.groupMemberships.length));
    const state = group.visibility === 'HiddenMembership' && collectionStatus[key] === 'complete' ? 'partial' : collectionStatus[key];
    groupCoverage.push({id:group.id,status:state});
    if (state !== 'complete') groupPartial = true;
    evidence.groupMemberships.push(...rows.filter(r=>text(r.id)).map(r=>({id:`${group.id}:${r.id}`,memberId:r.id,groupId:group.id})));
    delete collectionStatus[key];
  }
  collectionStatus.groupMemberships = !groups.length && groupsStatus !== 'complete' ? 'failed' : groupPartial ? 'partial' : 'complete';
  if (groupPartial) collectionWarnings.push('Group membership coverage is incomplete: up to 100 returned groups and 20,000 edges are collected; hidden membership is not requested.');
  let appPartial = collectionStatus.applications !== 'complete';
  for (const app of evidence.applications) {
    if (evidence.applicationAssignments.length >= 20000) { appPartial = true; break; }
    const key = `app:${app.id}`;
    const rows = await read(key,graphQueryPath(`servicePrincipals/${encodeURIComponent(app.id)}/appRoleAssignedTo`,{'$select':'id,principalId,principalType,resourceId,resourceDisplayName,appRoleId'}),['Application.Read.All'],Math.min(10000,20000-evidence.applicationAssignments.length));
    applicationCoverage.push({id:app.id,status:collectionStatus[key]});
    if (collectionStatus[key] !== 'complete') appPartial = true;
    evidence.applicationAssignments.push(...rows.filter(r=>text(r.id)&&text(r.principalId)&&text(r.appRoleId)).map(r=>({id:r.id,principalId:r.principalId,principalType:text(r.principalType),resourceId:text(r.resourceId)||app.id,resourceDisplayName:text(r.resourceDisplayName)||app.displayName,appRoleId:r.appRoleId})));
    delete collectionStatus[key];
  }
  collectionStatus.applicationAssignments = collectionStatus.applications === 'failed' ? 'failed' : appPartial ? 'partial' : 'complete';
  if (appPartial) collectionWarnings.push('Application-assignment coverage is incomplete: up to 50 service principals and 20,000 assignments are collected.');
  return evidence;
}

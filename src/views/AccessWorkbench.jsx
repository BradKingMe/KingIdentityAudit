import { useMemo, useRef, useState } from 'react';
import { Badge, Button, MessageBar, MessageBarBody } from '@fluentui/react-components';
import { AccessInvestigationView } from './EnterpriseViews.jsx';
import { accessSubjects, buildAccessProfile, createEmployeeReview, employeeActionPlan, parseEmployeeReview, REVIEW_TYPES } from '../domain/access.js';
import { formatDate } from '../domain/snapshot.js';

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content],{type}));
  const link = document.createElement('a');
  link.href=url; link.download=name; document.body.append(link); link.click(); link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
}
const packageName = review => `kingidentity-review-${review.id.replace(/[^a-z0-9-]/gi,'').slice(0,60) || 'export'}`;

function Entitlement({entry, children}) {
  return <article className="access-entry">
    <div className="access-entry-heading"><Badge appearance="outline">{entry.kind}</Badge><strong>{entry.label}</strong><span>{entry.source}</span></div>
    <ol className="access-chain" aria-label="Recorded access path">{entry.path.map((step,index)=><li key={index}>{step}</li>)}</ol>
    <p>{entry.basis}{entry.scope ? ` · Scope: ${entry.scope}` : ''} · Captured {formatDate(entry.capturedAt,{withTime:true})}</p>
    <details><summary>Source identifiers and limits</summary><p>{entry.limitation}</p><code>{entry.objectIds.join(' → ')}</code></details>
    {children}
  </article>;
}

function Coverage({profile}) {
  return <details className="access-coverage"><summary>Collection coverage and limitations ({profile.coverage.filter(c=>c.status!=='complete').length} incomplete or unavailable)</summary>
    <div className="table-scroll"><table className="data-table"><thead><tr><th>Source</th><th>Collection</th><th>Coverage</th><th>Captured</th></tr></thead><tbody>{profile.coverage.map((c,index)=><tr key={index}><td data-label="Source">{c.source}</td><td data-label="Collection">{c.key}</td><td data-label="Coverage">{c.status}</td><td data-label="Captured">{formatDate(c.capturedAt,{withTime:true})}</td></tr>)}</tbody></table></div>
    <ul>{profile.warnings.map((warning,index)=><li key={index}>{warning}</li>)}</ul>
    <p>Complete means the selected API/collector pass returned without a known local limit. It does not establish effective access. Hidden memberships, ACLs, policy enforcement and unconnected systems can be missing.</p>
  </details>;
}

function CapturedContext({profile}) {
  const state=value=>value===true?'Enabled':value===false?'Disabled':'Not returned';
  return <details className="access-coverage"><summary>Captured account, devices and activity</summary>
    <dl className="review-identity-context"><dt>Source identity</dt><dd>{profile.subject.key}</dd><dt>Account state</dt><dd>{state(profile.subject.accountEnabled)} · {profile.subject.source}</dd><dt>Entra object / tenant</dt><dd>{profile.subject.entraId||'Not included'} / {profile.subject.tenantId||'Not included'}</dd><dt>AD object / forest</dt><dd>{profile.subject.adId||'Not included'} / {profile.subject.forest||'Not included'}</dd><dt>Cross-source confirmation</dt><dd>{profile.subject.hybridConfirmed?'Operator confirmed the exact-UPN candidate':'Other-directory candidate not included'}</dd></dl>
    <div className="access-context"><section><h3>Captured devices ({profile.devices.length})</h3>{profile.devices.length?profile.devices.slice(0,10).map(device=><p key={device.id}><strong>{device.name}</strong> · {device.compliance||'State not returned'} · last sync {formatDate(device.lastSync)}<br/><code>{device.id}</code></p>):<p>No matched device evidence was captured. Absence can reflect collection scope, ownership mapping or an unconnected Intune source.</p>}{profile.devices.length>10&&<p>Showing the first 10 devices. The JSON package retains all {profile.devices.length} captured device references.</p>}</section><section><h3>Captured sign-in activity</h3>{profile.activity.length?profile.activity.map(event=><p key={event.id}><strong>{event.app||'Unknown app'}</strong> · {event.code===0?'Success':`Error ${event.code??'not returned'}`} · {formatDate(event.at,{withTime:true})}<br/><code>{event.id}</code></p>):<p>No matching activity was captured. Permissions, retention, the selected time window or a missing collection can explain the gap.</p>}<p>At most 10 recent matching events are retained. Device association is user context, not proof of which device performed a sign-in.</p></section></div>
  </details>;
}

function EmployeeReview({review,onUpdate}) {
  const [page,setPage]=useState(0);
  const profile=review.evidence;
  const progress=review.decisions.filter(d=>d.decision!=='unreviewed'&&d.reason.trim()).length;
  const ready=review.checklist.every(step=>step.complete)&&progress===review.decisions.length&&Boolean(review.owner.trim());
  const update=patch=>onUpdate({...review,...(review.status==='closed'&&!Object.hasOwn(patch,'status')?{status:'in-review'}:{}),...patch,updatedAt:new Date().toISOString()});
  const lastPage=Math.max(0,Math.ceil(profile.entitlements.length/50)-1);
  const currentPage=Math.min(page,lastPage);
  return <div className="employee-review">
    <div className="access-section-heading"><div><h2>{REVIEW_TYPES[review.type].label}: {profile.subject.name}</h2><p>Captured evidence from {formatDate(profile.capturedAt,{withTime:true})}. This review does not refresh or execute source changes.</p></div><Badge appearance="tint" color={review.status==='closed'?'success':'informative'}>{review.status}</Badge></div>
    {profile.synthetic&&<MessageBar intent="warning"><MessageBarBody>This case contains fictional demonstration evidence.</MessageBarBody></MessageBar>}
    {review.restored&&<MessageBar intent="warning"><MessageBarBody>Restored from an unsigned file. Its evidence, decisions and checklist statements have not been independently verified. Review them before closing.</MessageBarBody></MessageBar>}
    <div className="review-fields">
      <label>Review owner<input value={review.owner} maxLength={200} onChange={e=>update({owner:e.target.value})} placeholder="Name or team" /></label>
      <label>Due date<input type="date" value={review.dueDate} onChange={e=>update({dueDate:e.target.value})} /></label>
      <label>Review status<select value={review.status} onChange={e=>update({status:e.target.value})}><option value="open">Open</option><option value="in-review">In review</option><option value="closed" disabled={!ready}>Closed</option></select></label>
    </div>
    <p className="access-note">{progress} of {review.decisions.length} assignment decisions have a reason. Closing requires an owner, a reason for each decision and every checklist item checked. Closed records are operator attestations, not approval signatures.</p>
    <CapturedContext profile={profile}/>
    <h3>Owner review checklist</h3>
    <div className="review-checklist">{review.checklist.map(step=><label key={step.id}><input type="checkbox" checked={step.complete} onChange={e=>update({status:review.status==='closed'?'in-review':review.status,checklist:review.checklist.map(item=>item.id===step.id?{...item,complete:e.target.checked}:item)})}/><span>{step.description}</span></label>)}</div>
    <label className="review-notes">Case notes<textarea rows={3} value={review.notes} maxLength={4000} onChange={e=>update({notes:e.target.value})} placeholder="Approvals, missing evidence, dependencies, retained exceptions…" /></label>
    <div className="access-section-heading"><h3>Recorded assignments</h3><span>{profile.entitlements.length} evidence paths · one decision per path</span></div>
    {!profile.entitlements.length&&<p>No assignment paths were captured. Review collection coverage and unconnected systems before closing this case.</p>}
    {profile.entitlements.slice(currentPage*50,(currentPage+1)*50).map(entry=>{
      const decision=review.decisions.find(d=>d.id===entry.id);
      const change=patch=>update({status:review.status==='closed'?'in-review':review.status,decisions:review.decisions.map(d=>d.id===entry.id?{...d,...patch}:d)});
      return <Entitlement key={entry.id} entry={entry}><div className="decision-fields"><label>Decision for {entry.label}<select value={decision.decision} onChange={e=>change({decision:e.target.value})}><option value="unreviewed">Not reviewed</option><option value="retain">Retain — business need confirmed</option><option value="remove">Propose removal — approval required</option><option value="investigate">Investigate / evidence needed</option></select></label><label>Decision reason<input value={decision.reason} maxLength={1000} onChange={e=>change({reason:e.target.value})} placeholder="Record the owner’s rationale"/></label></div></Entitlement>;
    })}
    {lastPage>0&&<nav className="access-pagination" aria-label="Review assignment pages"><Button disabled={!currentPage} onClick={()=>setPage(currentPage-1)}>Previous</Button><span>Page {currentPage+1} of {lastPage+1}</span><Button disabled={currentPage===lastPage} onClick={()=>setPage(currentPage+1)}>Next</Button></nav>}
    <Coverage profile={profile}/>
    <div className="access-actions"><Button appearance="primary" onClick={()=>download(`${packageName(review)}.json`,JSON.stringify(review,null,2),'application/json')}>Export review package</Button><Button onClick={()=>download(`${packageName(review)}-plan.md`,employeeActionPlan(review),'text/markdown')}>Export action plan</Button></div>
    <p className="access-note">Review packages include identity IDs, paths, device/activity context and your notes. Store them as sensitive data. No account, membership or device change has been performed.</p>
  </div>;
}

export function AccessWorkbench({snapshot,principals,reviews,onReviews}) {
  const [tab,setTab]=useState('explorer');
  const [query,setQuery]=useState('');
  const [selected,setSelected]=useState('');
  const [confirmation,setConfirmation]=useState(null);
  const [kind,setKind]=useState('All');
  const [reviewType,setReviewType]=useState('access');
  const [reviewId,setReviewId]=useState('');
  const [error,setError]=useState('');
  const [page,setPage]=useState(0);
  const fileInput=useRef(null);
  const importGeneration=useRef(0);
  const reviewsRef=useRef(reviews);
  reviewsRef.current=reviews;
  const subjects=useMemo(()=>accessSubjects(snapshot),[snapshot]);
  const options=subjects.filter(s=>`${s.name} ${s.upn} ${s.source}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0,200);
  const subject=subjects.find(s=>s.key===selected)||options[0]||null;
  const confirmed=confirmation?.snapshot===snapshot&&confirmation?.subjectKey===subject?.key;
  const profile=useMemo(()=>subject?buildAccessProfile(snapshot,subject,confirmed):null,[snapshot,subject,confirmed]);
  const entries=profile?.entitlements.filter(e=>kind==='All'||e.kind===kind)||[];
  const lastPage=Math.max(0,Math.ceil(entries.length/50)-1);
  const currentPage=Math.min(page,lastPage);
  const activeReview=reviews.find(r=>r.id===reviewId)||reviews[0]||null;
  function createCase() {
    try {
      if (reviews.length>=25) throw new Error('This session already has 25 reviews. Export them and start a new session for more.');
      if (profile.entitlements.length>20000) throw new Error('This person exceeds the 20,000-path review package limit. Narrow the source scope before creating a case.');
      const review=createEmployeeReview(profile,reviewType);
      parseEmployeeReview(JSON.stringify(review));
      onReviews([...reviews,review]);setReviewId(review.id);setTab('reviews');setError('');
    } catch(e) {setError(e.message);}
  }
  async function restore(event) {
    const input=event.currentTarget;
    const file=input.files?.[0];
    if (!file) return;
    const generation=++importGeneration.current;
    try {
      if(file.size>10*1024*1024)throw new Error('Review packages must be 10 MB or smaller.');
      const review=parseEmployeeReview(await file.text());
      if(generation!==importGeneration.current)return;
      // Import as a separate record: an untrusted package cannot overwrite a local case.
      if(reviewsRef.current.length>=25)throw new Error('Export existing cases and start a new session before importing more than 25 reviews.');
      review.id=crypto.randomUUID();
      review.restored=true;
      review.status='in-review';
      onReviews(current=>[...current,review]);setReviewId(review.id);setTab('reviews');setError('');
    } catch(e) {if(generation===importGeneration.current)setError(e.message);} finally {input.value='';}
  }
  return <div className="access-workbench">
    <div className="access-tabs" role="group" aria-label="Access workspace"><Button appearance={tab==='explorer'?'primary':'subtle'} aria-pressed={tab==='explorer'} onClick={()=>setTab('explorer')}>Access explorer</Button><Button appearance={tab==='signin'?'primary':'subtle'} aria-pressed={tab==='signin'} onClick={()=>setTab('signin')}>Sign-in evidence</Button><Button appearance={tab==='reviews'?'primary':'subtle'} aria-pressed={tab==='reviews'} onClick={()=>setTab('reviews')}>Employee reviews ({reviews.length})</Button></div>
    {error&&<MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
    {tab==='signin'&&<AccessInvestigationView snapshot={snapshot} principals={principals}/>}
    {tab==='explorer'&&<section className="panel access-explorer">
      <div className="access-section-heading"><div><h2>Why does this person have access?</h2><p>Follow recorded memberships and assignments. Policy enforcement and app-local permissions are outside this view.</p></div><Badge appearance="outline">Read-only evidence</Badge></div>
      <div className="access-person-picker"><label>Search identities<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Name, UPN or source" /></label><label>Person<select value={subject?.key||''} onChange={e=>{setSelected(e.target.value);setConfirmation(null);setPage(0);}}><option value="" disabled>Select an identity</option>{subject&&!options.some(s=>s.key===subject.key)&&<option value={subject.key}>{subject.name} · {subject.source}</option>}{options.map(s=><option key={s.key} value={s.key}>{s.name} · {s.source} · {s.upn||s.key}</option>)}</select></label></div>
      <p className="access-note">Showing up to 200 matching identities. Search to narrow the list. Source IDs are authoritative; names are labels.{subject&&!options.some(s=>s.key===subject.key)?' Your previously selected identity is retained; choose a search result to switch.':''}</p>
      {!profile?<div className="empty-state compact-empty"><strong>No person evidence available</strong><span>Import an AD snapshot or collect Entra directory evidence in Sources. AD users need a GUID or SID.</span></div>:<>
        <div className="access-person-summary"><div><strong>{profile.subject.name}</strong><span>{profile.subject.userPrincipalName||'UPN not returned'}</span></div><div><span>Account state</span><strong>{profile.subject.accountEnabled===true?'Enabled':profile.subject.accountEnabled===false?'Disabled':'Not returned'}</strong></div><div><span>Evidence paths</span><strong>{profile.entitlements.length}</strong></div><div><span>Dataset</span><strong>{profile.synthetic?'Synthetic example':'Collected / imported'}</strong></div></div>
        {profile.candidate&&<label className="hybrid-confirm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmation(e.target.checked?{snapshot,subjectKey:subject.key}:null)}/><span>Include the exact-UPN candidate <strong>{profile.candidate.name}</strong> from the other directory. I verified these accounts belong to the same person. This confirmation applies only to this workspace.</span></label>}
        {profile.ambiguousCandidate&&<p className="access-note">More than one account has this UPN in the other directory. Cross-source evidence is excluded; resolve the ambiguity in the source.</p>}
        <Coverage profile={profile}/>
        <div className="access-section-heading"><h3>Recorded access paths</h3><label className="access-kind">Show<select value={kind} onChange={e=>{setKind(e.target.value);setPage(0);}}>{['All','Group','Role','Application'].map(k=><option key={k}>{k}</option>)}</select></label></div>
        {!entries.length&&<p className="access-empty">No matching assignments were returned in this evidence. This is not proof that the person has no access. Enable access relationship collection in Sources and check its coverage.</p>}
        {entries.slice(currentPage*50,(currentPage+1)*50).map(entry=><Entitlement key={entry.id} entry={entry}/>)}
        {lastPage>0&&<nav className="access-pagination" aria-label="Access path pages"><Button disabled={!currentPage} onClick={()=>setPage(currentPage-1)}>Previous</Button><span>Page {currentPage+1} of {lastPage+1}</span><Button disabled={currentPage===lastPage} onClick={()=>setPage(currentPage+1)}>Next</Button></nav>}
        <div className="access-context"><section><h3>Related devices ({profile.devices.length})</h3>{profile.devices.length?profile.devices.slice(0,10).map(d=><p key={d.id}><strong>{d.name}</strong> · {d.compliance||'State not returned'} · last sync {formatDate(d.lastSync)}</p>):<p>No matched device evidence. Devices can be absent because of scope, ownership mapping or missing collection.</p>}{profile.devices.length>10&&<p>Showing the first 10 devices; the review JSON retains all matched references.</p>}</section><section><h3>Recent captured activity</h3>{profile.activity.length?profile.activity.map(e=><p key={e.id}><strong>{e.app||'Unknown app'}</strong> · {e.code===0?'Success':`Error ${e.code??'not returned'}`} · {formatDate(e.at,{withTime:true})}</p>):<p>No matching sign-in evidence in the captured window.</p>}</section></div>
        <div className="access-create"><div><h3>Start an employee review</h3><p>Freeze this evidence, record decisions and prepare an owner-led action plan.</p></div><label>Review type<select value={reviewType} onChange={e=>setReviewType(e.target.value)}>{Object.entries(REVIEW_TYPES).map(([id,type])=><option key={id} value={id}>{type.label}</option>)}</select></label><Button appearance="primary" onClick={createCase}>Create review case</Button></div>
      </>}
    </section>}
    {tab==='reviews'&&<section className="panel access-reviews"><div className="access-section-heading"><div><h2>Employee reviews</h2><p>Cases stay in this tab’s memory across navigation and workspace changes. Export before reloading or closing the tab.</p></div><Button onClick={()=>fileInput.current.click()}>Restore review package</Button><input ref={fileInput} type="file" accept=".json,application/json" hidden aria-label="Restore employee review JSON" onChange={restore}/></div>
      {reviews.length?<><label className="review-case-picker">Review case<select value={activeReview.id} onChange={e=>setReviewId(e.target.value)}>{reviews.map(r=><option key={r.id} value={r.id}>{r.evidence.subject.name} · {REVIEW_TYPES[r.type].label} · {r.owner||'Unassigned'} · {r.status} · {r.id.slice(0,8)}</option>)}</select></label><EmployeeReview key={activeReview.id} review={activeReview} onUpdate={updated=>onReviews(current=>current.map(r=>r.id===updated.id?updated:r))}/></>:<div className="empty-state compact-empty"><strong>No review cases yet</strong><span>Select a person in Access explorer and create an access, new hire, transfer or offboarding review. You can also restore an exported package.</span></div>}
    </section>}
  </div>;
}

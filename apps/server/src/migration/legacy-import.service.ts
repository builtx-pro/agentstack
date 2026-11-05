import { createHash, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { z } from 'zod';

const stamp = z.string().refine(value => Number.isFinite(Date.parse(value)), 'Invalid timestamp');
const commentSchema = z.object({
  id: z.number().int().positive(), request_id: z.string(), variant: z.string(), screen: z.string(), palette: z.string(),
  author: z.string(), body: z.string(), principal: z.string(), status: z.enum(['open', 'done']), version: z.number().int().positive(),
  created_at: stamp, updated_at: stamp, resolved_at: stamp.nullable(), resolved_by: z.string().nullable(), resolution: z.string().nullable(),
  targetKey: z.string().min(1), importedAuthorUnverified: z.literal(true),
}).strict();
const eventSchema = z.object({
  id: z.number().int().positive(), comment_id: z.number().int().positive(), status: z.enum(['open', 'done']),
  author: z.string(), principal: z.string(), note: z.string(), created_at: stamp,
}).strict();
const legacySchema = z.object({
  schemaVersion: z.literal(1), legacySource: z.string().min(1).max(200),
  comments: z.array(commentSchema).max(100000), events: z.array(eventSchema).max(1000000),
}).strict();
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const importedLabel = (value: string) => `${value} · imported (unverified)`;

/** Operator-only, never mounted as an HTTP/MCP endpoint. No credentials appear in results. */
export async function importLegacyReview(options: {
  ownerUrl: string; projectId: string; operatorEmail: string; payload: unknown; dryRun: boolean;
}) {
  z.uuid().parse(options.projectId);
  const payload = legacySchema.parse(options.payload);
  const commentIds = new Set(payload.comments.map(item => item.id));
  if (commentIds.size !== payload.comments.length || new Set(payload.events.map(item => item.id)).size !== payload.events.length) throw new Error('Duplicate legacy identifiers');
  if (payload.events.some(item => !commentIds.has(item.comment_id))) throw new Error('Orphan legacy events must be reconciled');
  const eventGroups = new Map<number, z.infer<typeof eventSchema>[]>();
  for (const event of payload.events) { const group = eventGroups.get(event.comment_id) ?? []; group.push(event); eventGroups.set(event.comment_id, group); }
  const pool = new Pool({ connectionString: options.ownerUrl, max: 1 });
  const db = await pool.connect();
  const report = { dryRun: options.dryRun, comments: 0, events: 0, skipped: 0 };
  try {
    await db.query('BEGIN');
    await db.query("SELECT set_config('agentstack.project_id',$1,true),set_config('agentstack.is_admin','true',true)", [options.projectId]);
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [options.projectId + ':' + payload.legacySource]);
    const actor = (await db.query('SELECT id,name FROM users WHERE lower(email)=lower($1) AND is_admin=true AND disabled=false', [options.operatorEmail])).rows[0];
    if (!actor) throw new Error('An existing enabled installation administrator is required');
    const project = await db.query('SELECT id FROM projects WHERE id=$1', [options.projectId]);
    if (!project.rowCount) throw new Error('Destination project does not exist');
    const targets = new Map((await db.query('SELECT id,key,version,visibility FROM objects WHERE project_id=$1', [options.projectId])).rows.map(row => [row.key, row]));
    for (const comment of payload.comments) {
      const events = (eventGroups.get(comment.id) ?? []).sort((a,b) => a.id-b.id);
      const payloadHash = digest({ comment, events });
      const prior = (await db.query("SELECT new_id,payload_hash FROM legacy_provenance WHERE project_id=$1 AND source=$2 AND kind='comment' AND legacy_id=$3", [options.projectId,payload.legacySource,String(comment.id)])).rows[0];
      const target = targets.get(comment.targetKey);
      if (!target) throw new Error(`Missing catalog target for legacy comment ${comment.id}`);
      const preserveLink = async (noteId: string) => {
        const existing = (await db.query("SELECT target_id,note_id FROM legacy_links WHERE project_id=$1 AND source='concepts' AND kind='comment' AND legacy_id=$2",[options.projectId,String(comment.id)])).rows[0];
        if (existing && (existing.target_id !== target.id || existing.note_id !== noteId)) throw new Error(`Legacy comment ${comment.id} link conflicts with a previous source`);
        if (!existing) await db.query("INSERT INTO legacy_links(project_id,source,kind,legacy_id,target_id,note_id) VALUES($1,'concepts','comment',$2,$3,$4)",[options.projectId,String(comment.id),target.id,noteId]);
      };
      if (prior) {
        if (prior.payload_hash !== payloadHash) throw new Error(`Legacy comment ${comment.id} differs from the previous import; reconcile rather than overwrite`);
        await preserveLink(prior.new_id);
        report.skipped += 1; continue;
      }
      if (events.length && events.at(-1)!.status !== comment.status) throw new Error(`Legacy final status mismatch on comment ${comment.id}`);
      if (events.length !== comment.version) throw new Error(`Legacy event/version mismatch on comment ${comment.id}`);
      const noteId = randomUUID();
      const status = comment.status === 'done' ? 'resolved' : 'open';
      await db.query(`INSERT INTO notes(id,project_id,target_id,target_version,body,author_id,author_name,visibility,status,version,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [noteId,options.projectId,target.id,target.version,comment.body,actor.id,importedLabel(comment.author),target.visibility,status,comment.version,comment.created_at,comment.updated_at]);
      const snapshot = {
        id: noteId, projectId: options.projectId, targetId: target.id, targetVersion: target.version,
        body: comment.body, authorName: importedLabel(comment.author), visibility: target.visibility,
        status, version: comment.version, claimedBy: null, claimExpiresAt: null, result: null,
        createdAt: new Date(comment.created_at).toISOString(), updatedAt: new Date(comment.updated_at).toISOString(),
      };
      for (const [index,event] of events.entries()) {
        const version = index + 1;
        const revisionId = randomUUID();
        const eventSnapshot = { ...snapshot, status: event.status === 'done' ? 'resolved' : 'open', version, updatedAt: new Date(event.created_at).toISOString() };
        await db.query(`INSERT INTO note_revisions(id,project_id,note_id,version,actor_id,actor_name,source,summary,visibility,snapshot,created_at)
          VALUES($1,$2,$3,$4,$5,$6,'import',$7,$8,$9,$10)`,
          [revisionId,options.projectId,noteId,version,actor.id,importedLabel(event.author),event.note,target.visibility,JSON.stringify(eventSnapshot),event.created_at]);
        await db.query(`INSERT INTO legacy_provenance(project_id,source,kind,legacy_id,new_id,payload_hash,private_payload)
          VALUES($1,$2,'event',$3,$4,$5,$6)`, [options.projectId,payload.legacySource,String(event.id),revisionId,digest(event),JSON.stringify(event)]);
        report.events += 1;
      }
      await db.query(`INSERT INTO legacy_provenance(project_id,source,kind,legacy_id,new_id,payload_hash,private_payload)
        VALUES($1,$2,'comment',$3,$4,$5,$6)`, [options.projectId,payload.legacySource,String(comment.id),noteId,payloadHash,JSON.stringify({ ...comment, originalTargetRevisionUnknown: true })]);
      await db.query(`INSERT INTO audit_events(id,project_id,actor_id,actor_name,source,action,target_id,visibility,summary,data)
        VALUES($1,$2,$3,$4,'import','note.import',$5,$6,'Imported historical feedback (author unverified)',$7)`,
        [randomUUID(),options.projectId,actor.id,actor.name,target.id,target.visibility,JSON.stringify({noteId,legacyId:comment.id})]);
      await preserveLink(noteId);
      report.comments += 1;
    }
    await db.query(options.dryRun ? 'ROLLBACK' : 'COMMIT');
    return report;
  } catch (error) {
    await db.query('ROLLBACK');throw error;
  } finally {
    db.release();await pool.end();
  }
}

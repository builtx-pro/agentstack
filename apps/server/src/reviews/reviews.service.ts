import { randomUUID } from "node:crypto";
import type { Context } from "../db/database.service.js";
import { canEdit, human } from "../db/database.service.js";
import type {
  NoteDraft,
  NoteTransition,
  ReviewNote,
} from "@agentstack/contracts";
import { AppError, conflict, forbidden, missing } from "../shared/errors.js";
import { isCustomer, readObjectRow } from "../objects/objects.service.js";
import { audit } from "../shared/audit.service.js";
import { lockProjectRules, activeRuleRevisions, type RuleRevision } from "../rules/rule-snapshot.service.js";
import { decodeCursor, page } from "../shared/pagination.util.js";
export interface NoteRow {
  id: string;
  project_id: string;
  target_id: string;
  target_version: number;
  body: string;
  author_id: string;
  author_key: string;
  author_name: string;
  visibility: "team" | "customer";
  status: ReviewNote["status"];
  version: number;
  claimed_by: string | null;
  claimed_name: string | null;
  claimed_rule_revisions: RuleRevision[] | null;
  claim_expires_at: Date | null;
  result: ReviewNote["result"];
  created_at: Date;
  updated_at: Date;
}
export const noteDto = (n: NoteRow): ReviewNote => ({
  id: n.id,
  projectId: n.project_id,
  targetId: n.target_id,
  targetVersion: n.target_version,
  body: n.body,
  authorName: n.author_name,
  visibility: n.visibility,
  status: n.status,
  version: n.version,
  claimedBy: n.claimed_name,
  claimedRuleRevisions: n.claimed_rule_revisions ?? null,
  claimExpiresAt: n.claim_expires_at
    ? new Date(n.claim_expires_at).toISOString()
    : null,
  result: n.result,
  createdAt: new Date(n.created_at).toISOString(),
  updatedAt: new Date(n.updated_at).toISOString(),
});
function visibleNote(ctx: Context, note: ReviewNote): ReviewNote {
  if (!isCustomer(ctx)) return note;
  const { claimedRuleRevisions: _internal, ...visible } = note;
  return visible;
}
async function getNoteRow(
  ctx: Context,
  id: string,
  lock = false,
): Promise<NoteRow> {
  const row = (
    await ctx.db.query(
      `SELECT n.* FROM notes n JOIN objects o ON o.id=n.target_id AND o.project_id=n.project_id JOIN object_revisions r ON r.project_id=n.project_id AND r.object_id=n.target_id AND r.version=n.target_version WHERE n.project_id=$1 AND n.id=$2 AND ($3=false OR (n.visibility='customer' AND o.visibility='customer' AND r.visibility='customer' AND o.kind<>'rule')) ${lock ? "FOR UPDATE OF n" : ""}`,
      [ctx.projectId, id, isCustomer(ctx)],
    )
  ).rows[0];
  if (!row) throw missing();
  return row;
}
export async function getNote(ctx: Context, id: string) {
  return visibleNote(ctx, noteDto(await getNoteRow(ctx, id)));
}
async function revision(ctx: Context, n: NoteRow, summary: string) {
  await ctx.db.query(
    "INSERT INTO note_revisions(id,project_id,note_id,version,actor_id,actor_name,source,summary,visibility,snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    [
      randomUUID(),
      ctx.projectId,
      n.id,
      n.version,
      ctx.principal.id,
      ctx.principal.name,
      ctx.principal.type === "agent" ? "agent" : "web",
      summary,
      n.visibility,
      JSON.stringify(noteDto(n)),
    ],
  );
  await audit(ctx, "review." + n.status, summary, n.target_id, n.visibility, {
    noteId: n.id,
    version: n.version,
  });
}
export async function createNote(ctx: Context, draft: NoteDraft) {
  const object = await readObjectRow(ctx, draft.targetId);
  const targetRevision = (
    await ctx.db.query(
      "SELECT visibility FROM object_revisions WHERE project_id=$1 AND object_id=$2 AND version=$3",
      [ctx.projectId, draft.targetId, draft.targetVersion],
    )
  ).rows[0];
  if (
    !targetRevision ||
    (isCustomer(ctx) && targetRevision.visibility !== "customer")
  )
    throw missing();
  if (isCustomer(ctx) && draft.visibility !== "customer") throw forbidden();
  const visibility =
    object.visibility === "team" || targetRevision.visibility === "team"
      ? "team"
      : draft.visibility;
  const row = (
    await ctx.db.query(
      "INSERT INTO notes(id,project_id,target_id,target_version,body,author_id,author_name,visibility,author_key,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'open') RETURNING *",
      [
        randomUUID(),
        ctx.projectId,
        draft.targetId,
        draft.targetVersion,
        draft.body,
        ctx.principal.id,
        ctx.principal.name,
        visibility,
        ctx.principal.key,
      ],
    )
  ).rows[0];
  await revision(ctx, row, "Feedback added");
  return visibleNote(ctx, noteDto(row));
}
export async function patchNote(
  ctx: Context,
  id: string,
  input: { expectedVersion: number; body: string },
) {
  const old = await getNoteRow(ctx, id, true);
  if (old.version !== input.expectedVersion) throw conflict();
  if (
    old.author_key !== ctx.principal.key &&
    !(ctx.principal.type === "human" && ctx.principal.isAdmin)
  )
    throw forbidden();
  if (ctx.principal.type === "agent" && old.author_key !== ctx.principal.key)
    throw forbidden();
  const row = (
    await ctx.db.query(
      "UPDATE notes SET body=$3,version=version+1,updated_at=now() WHERE project_id=$1 AND id=$2 RETURNING *",
      [ctx.projectId, id, input.body],
    )
  ).rows[0];
  await revision(ctx, row, "Feedback text edited");
  return visibleNote(ctx, noteDto(row));
}
export async function transitionNote(
  ctx: Context,
  id: string,
  input: NoteTransition,
) {
  if (input.action === "claim" || input.action === "submit") await lockProjectRules(ctx);
  const old = await getNoteRow(ctx, id, true);
  if (old.version !== input.expectedVersion) throw conflict();
  let status = old.status,
    claim = old.claimed_by,
    claimName = old.claimed_name,
    expires = old.claim_expires_at,
    result = old.result,
    ruleRevisions = old.claimed_rule_revisions ?? null;
  const active =
    old.claim_expires_at && new Date(old.claim_expires_at) > new Date();
  switch (input.action) {
    case "claim":
      canEdit(ctx);
      if (old.status === "resolved" || old.status === "ready_for_review")
        throw conflict("Only open or expired in-progress work can be claimed.");
      if (active && old.claimed_by !== ctx.principal.key)
        throw conflict("Another contributor holds this task.");
      ruleRevisions = await activeRuleRevisions(ctx);
      status = "in_progress";
      claim = ctx.principal.key;
      claimName = ctx.principal.name;
      expires = new Date(Date.now() + 30 * 60_000);
      break;
    case "submit":
      canEdit(ctx);
      if (old.status !== "in_progress" || !active)
        throw conflict("Claim the task before submitting a result.");
      if (
        claim !== ctx.principal.key &&
        !(ctx.principal.type === "human" && ctx.role === "admin")
      )
        throw forbidden();
      if (ruleRevisions === null)
        throw new AppError(409, "rules_snapshot_required", "This claim has no recorded rule snapshot. Read current rules and explicitly claim the task again before submitting.");
      if (JSON.stringify(ruleRevisions) !== JSON.stringify(await activeRuleRevisions(ctx)))
        throw new AppError(409, "rules_changed", "Project rules changed after this claim. Read current rules and explicitly claim the task again before submitting.");
      if (!input.result)
        throw new AppError(
          422,
          "evidence_required",
          "Provide a result summary and checks.",
        );
      status = "ready_for_review";
      result = {
        ...input.result,
        evidenceSource: ctx.principal.type === "agent" ? "agent" : "human",
      };
      claim = null;
      claimName = null;
      expires = null;
      break;
    case "resolve":
      human(ctx);
      if (old.status !== "ready_for_review")
        throw conflict("A result must be submitted before acceptance.");
      if (!input.reason)
        throw new AppError(422, "reason_required", "Explain the acceptance.");
      status = "resolved";
      break;
    case "reopen":
      human(ctx);
      if (!input.reason)
        throw new AppError(
          422,
          "reason_required",
          "Explain what remains to fix.",
        );
      status = "open";
      ruleRevisions = null;
      claim = null;
      claimName = null;
      expires = null;
      break;
    case "release":
      canEdit(ctx);
      if (old.status !== "in_progress")
        throw conflict("This task is not in progress.");
      if (
        active &&
        claim !== ctx.principal.key &&
        !(ctx.principal.type === "human" && ctx.role === "admin")
      )
        throw forbidden();
      status = "open";
      ruleRevisions = null;
      claim = null;
      claimName = null;
      expires = null;
      break;
  }
  const row = (
    await ctx.db.query(
      "UPDATE notes SET status=$3,claimed_by=$4,claimed_name=$5,claim_expires_at=$6,result=$7,claimed_rule_revisions=$8,version=version+1,updated_at=now() WHERE project_id=$1 AND id=$2 RETURNING *",
      [
        ctx.projectId,
        id,
        status,
        claim,
        claimName,
        expires,
        result ? JSON.stringify(result) : null,
        ruleRevisions === null ? null : JSON.stringify(ruleRevisions),
      ],
    )
  ).rows[0];
  await revision(
    ctx,
    row,
    input.reason ?? input.result?.summary ?? `Review ${input.action}`,
  );
  return visibleNote(ctx, noteDto(row));
}
export async function listNotes(
  ctx: Context,
  q: { targetId?: string; status?: string; limit: number; cursor?: string },
) {
  if (q.targetId) await readObjectRow(ctx, q.targetId);
  const rows = (
    await ctx.db.query(
      "SELECT n.* FROM notes n JOIN objects o ON o.id=n.target_id AND o.project_id=n.project_id JOIN object_revisions r ON r.project_id=n.project_id AND r.object_id=n.target_id AND r.version=n.target_version WHERE n.project_id=$1 AND ($2=false OR (n.visibility='customer' AND o.visibility='customer' AND r.visibility='customer' AND o.kind<>'rule')) AND ($3::uuid IS NULL OR n.target_id=$3) AND ($4::text IS NULL OR n.status=$4) AND (n.id>$5::uuid OR $5 IS NULL) ORDER BY n.id LIMIT $6",
      [
        ctx.projectId,
        isCustomer(ctx),
        q.targetId ?? null,
        q.status ?? null,
        decodeCursor(q.cursor),
        q.limit + 1,
      ],
    )
  ).rows as NoteRow[];
  const result = page(rows, q.limit);
  return { ...result, items: result.items.map((row) => visibleNote(ctx, noteDto(row))) };
}
export async function noteHistory(
  ctx: Context,
  id: string,
  limit: number,
  cursor?: string,
) {
  await getNoteRow(ctx, id);
  const rows = (
    await ctx.db.query(
      'SELECT id,version,actor_name AS "actorName",source,summary,created_at AS "createdAt",snapshot FROM note_revisions WHERE project_id=$1 AND note_id=$2 AND ($3=false OR visibility=\'customer\') AND (id>$4::uuid OR $4 IS NULL) ORDER BY id LIMIT $5',
      [ctx.projectId, id, isCustomer(ctx), decodeCursor(cursor), limit + 1],
    )
  ).rows;
  const result = page(rows, limit);
  return {...result, items: result.items.map((item) => ({...item, snapshot: visibleNote(ctx, item.snapshot)}))};
}

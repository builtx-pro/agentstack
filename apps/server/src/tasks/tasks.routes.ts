import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  idSchema,
  personalTaskDraftSchema,
  personalTaskPatchSchema,
  taskListQuerySchema,
  taskHistoryQuerySchema,
} from "@agentstack/contracts";
import type { Database } from "../db/database.service.js";
import { forbidden, parse } from "../shared/errors.js";
import * as tasks from "./tasks.service.js";
export function registerTaskRoutes(app: FastifyInstance, database: Database) {
  const prefix = "/api/v1/tasks";
  const principal = (r: FastifyRequest) => {
    if (!r.principal) throw forbidden();
    return tasks.taskHuman(r.principal);
  };
  const id = (r: FastifyRequest) =>
    parse(z.object({ id: idSchema }), r.params).id;
  app.get(prefix, (r) =>
    tasks.listTasks(
      database,
      principal(r),
      parse(taskListQuerySchema, r.query),
    ),
  );
  app.post(prefix, async (r, reply) => {
    const result = await tasks.createTask(
      database,
      principal(r),
      parse(personalTaskDraftSchema, r.body),
    );
    reply.code(result.created ? 201 : 200);
    return result.task;
  });
  app.get(prefix + "/:id", (r) => tasks.getTask(database, principal(r), id(r)));
  app.patch(prefix + "/:id", (r) =>
    tasks.patchTask(
      database,
      principal(r),
      id(r),
      parse(personalTaskPatchSchema, r.body),
    ),
  );
  app.get(prefix + "/:id/history", (r) => {
    const q = parse(taskHistoryQuerySchema, r.query);
    return tasks.taskHistory(database, principal(r), id(r), q.limit, q.cursor);
  });
}

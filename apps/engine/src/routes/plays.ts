import type { FastifyInstance, FastifyReply, preHandlerHookHandler } from "fastify";
import { z } from "zod";
import { Mode } from "@baseland/play-schema";
import { PlayError, type PlayRuntime } from "../plays/runtime.js";
import { TransitionError } from "../plays/machine.js";

const CreateBody = z.object({ cartridge: z.unknown(), mode: Mode.default("ghost") });
type IdParams = { Params: { id: string } };

export function playRoutes(app: FastifyInstance, deps: { auth: preHandlerHookHandler; runtime: PlayRuntime }) {
  const { auth, runtime } = deps;

  const handle = async (reply: FastifyReply, fn: () => Promise<unknown>) => {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof PlayError) return reply.code(err.status).send({ error: err.message, details: err.details });
      if (err instanceof TransitionError) return reply.code(409).send({ error: err.message });
      throw err;
    }
  };

  app.post("/v1/plays", { preHandler: auth }, async (req, reply) => {
    const body = CreateBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "expected { cartridge, mode }" });
    return handle(reply, async () => reply.code(201).send(await runtime.create(req.userId, body.data.cartridge, body.data.mode)));
  });

  app.get("/v1/plays", { preHandler: auth }, async (req) => ({ plays: await runtime.list(req.userId) }));

  app.get<IdParams>("/v1/plays/:id", { preHandler: auth }, (req, reply) =>
    handle(reply, () => runtime.get(req.userId, req.params.id)),
  );

  for (const action of ["approve", "skip", "pause", "resume", "kill"] as const) {
    app.post<IdParams>(`/v1/plays/:id/${action}`, { preHandler: auth }, (req, reply) =>
      handle(reply, () => runtime[action](req.userId, req.params.id)),
    );
  }

  app.post("/v1/kill-all", { preHandler: auth }, async (req) => ({ stopped: await runtime.killAll(req.userId) }));
}

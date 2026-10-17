import { idParamsSchema, projectSchema, teamMemberSchema } from '@planpilot/shared';
import type { ProjectInput, TeamMemberInput } from '@planpilot/shared';
import { Router } from 'express';
import type { Request, RequestHandler, Response } from 'express';
import { authorize, currentUser } from '../../middlewares/authenticate';
import { input, validate } from '../../middlewares/validate';
import { ok } from '../../utils/respond';
import * as workspace from './workspace.service';

const id = (req: Request) => input.params<{ id: string }>(req).id;

export function createWorkspaceRouter(auth: RequestHandler) {
  const router = Router();
  // Guards are attached per route: a router.use() here would also catch /admin paths.
  const guard = [auth, authorize('user')];

  router.get('/projects', ...guard, async (req: Request, res: Response) => {
    ok(res, await workspace.listProjects(currentUser(req).id));
  });
  router.post(
    '/projects',
    ...guard,
    validate({ body: projectSchema }),
    async (req: Request, res: Response) => {
      ok(
        res,
        await workspace.createProject(currentUser(req).id, input.body<ProjectInput>(req)),
        201,
      );
    },
  );
  router.patch(
    '/projects/:id',
    ...guard,
    validate({ params: idParamsSchema, body: projectSchema }),
    async (req: Request, res: Response) => {
      ok(
        res,
        await workspace.updateProject(currentUser(req).id, id(req), input.body<ProjectInput>(req)),
      );
    },
  );
  router.delete(
    '/projects/:id',
    ...guard,
    validate({ params: idParamsSchema }),
    async (req: Request, res: Response) => {
      await workspace.deleteProject(currentUser(req).id, id(req));
      ok(res, { deleted: true });
    },
  );

  router.get('/team', ...guard, async (req: Request, res: Response) => {
    ok(res, await workspace.listTeam(currentUser(req).id));
  });
  router.post(
    '/team',
    ...guard,
    validate({ body: teamMemberSchema }),
    async (req: Request, res: Response) => {
      ok(
        res,
        await workspace.addTeamMember(currentUser(req).id, input.body<TeamMemberInput>(req)),
        201,
      );
    },
  );
  router.delete(
    '/team/:id',
    ...guard,
    validate({ params: idParamsSchema }),
    async (req: Request, res: Response) => {
      await workspace.removeTeamMember(currentUser(req).id, id(req));
      ok(res, { deleted: true });
    },
  );

  return router;
}

import { Router } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { openApiDocument } from './openapi';

/** Where app.ts mounts this router. */
const DOCS_BASE = '/api';

export const docsRouter = Router();

docsRouter.get('/openapi.json', (_req, res) => {
  res.json(openApiDocument);
});

// Swagger UI needs its own scripts and styles, so this route alone gets a looser CSP.
docsRouter.use(
  '/docs',
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  }),
  swaggerUi.serve,
  // The page loads the document from /api/openapi.json rather than having it inlined:
  // swagger-ui-express inlines with String.replace, which mangles text containing "$`"
  // or "$'". A fixed URL also means a ?url= query can't point the page at another spec.
  swaggerUi.setup(null, {
    customSiteTitle: 'PlanPilot API',
    swaggerUrl: `${DOCS_BASE}/openapi.json`,
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      showExtensions: true,
      filter: true,
    },
  }),
);

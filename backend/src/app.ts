import fs from 'node:fs';
import path from 'node:path';
import express, { type Application, type Request, type Response } from 'express';
import cors, { type CorsOptions } from 'cors';
import helmet from 'helmet';
import { config } from './config/env';
import { logger } from './lib/logger';
import { resolveLocalPath } from './lib/storage';
import routes from './routes';
import { globalErrorHandler, notFoundHandler } from './middlewares/errorHandler.middleware';
import { sequelize } from './db/models';

const corsOptions: CorsOptions = {
    origin(origin, callback) {
        // Same-origin and non-browser requests have no Origin header.
        if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
        callback(null, false);
    },
    methods: ['GET', 'PUT', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Origin'],
    credentials: true,
    optionsSuccessStatus: 204,
    maxAge: 600,
};

const app: Application = express();

app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);

// JSON API: no HTML is served, so a strict CSP is free. Images under /uploads
// are embedded by the SPA from another origin, hence cross-origin CORP.
app.use(
    helmet({
        contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
        crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
);
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

if (!config.isTest) {
    app.use((req, res, next) => {
        const start = process.hrtime.bigint();
        res.on('finish', () => {
            const ms = Number(process.hrtime.bigint() - start) / 1e6;
            logger.debug(`${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} ${ms.toFixed(1)}ms`);
        });
        next();
    });
}

// Local image storage (STORAGE_DRIVER=local). Missing files fall back, read-only,
// to STORAGE_FALLBACK_URL so images referenced by an imported dump still show.
if (config.storage.driver === 'local') {
    app.use(
        '/uploads',
        express.static(config.storage.uploadsDir, { fallthrough: true, index: false, dotfiles: 'deny', maxAge: '7d' }),
        (req: Request, res: Response) => {
            const key = decodeURIComponent(req.path.replace(/^\/+/, ''));
            const [bucket, ...rest] = key.split('/');
            let safe = false;
            try {
                safe = Boolean(bucket && rest.length && resolveLocalPath(bucket, rest.join('/')));
            } catch {
                safe = false;
            }
            if (safe && config.storage.fallbackUrl && !fs.existsSync(path.join(config.storage.uploadsDir, key))) {
                res.redirect(302, `${config.storage.fallbackUrl}/${key.split('/').map(encodeURIComponent).join('/')}`);
                return;
            }
            res.status(404).json({ message: 'File not found.' });
        },
    );
}

app.get('/', (_req: Request, res: Response) => {
    res.status(200).json({ message: 'Welcome to Wanderluxe API ✈️' });
});

/** Liveness + database connectivity, for docker/orchestrators and smoke tests. */
app.get('/health', async (_req: Request, res: Response) => {
    try {
        await sequelize.query('SELECT 1');
        res.json({ status: 'ok', database: 'up' });
    } catch {
        res.status(503).json({ status: 'error', database: 'down' });
    }
});

app.use('/api', routes);
app.use(notFoundHandler);
app.use(globalErrorHandler);

export default app;

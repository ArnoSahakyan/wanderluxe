import { config } from './config/env';
import { logger } from './lib/logger';
import app from './app';
import { sequelize } from './db/models';

const startServer = async (): Promise<void> => {
    try {
        await sequelize.authenticate();
        const target = config.db.url
            ? (() => {
                  const u = new URL(config.db.url);
                  return { host: u.hostname, database: u.pathname.slice(1) };
              })()
            : { host: config.db.host, database: config.db.name };
        logger.info('Database connected', { ...target, ssl: Boolean(config.db.ssl) });
        if (config.isProduction && !config.db.ssl && !['localhost', '127.0.0.1'].includes(target.host ?? '')) {
            logger.warn('DB_SSL is off for a remote database: connections are not encrypted.');
        }
    } catch (err) {
        logger.error('Unable to connect to the database — is PostgreSQL running? (npm run db:up)', { err });
        process.exit(1);
    }

    if (config.isProduction && config.corsOrigins.length === 0) {
        logger.warn('CORS_ORIGIN is empty: browsers on other origins (e.g. the Vercel site) cannot call this API.');
    }

    const server = app.listen(config.port, () => {
        logger.info(`API listening on http://localhost:${config.port}`, {
            env: config.env,
            storage: config.storage.driver,
            corsOrigins: config.corsOrigins,
        });
    });

    const shutdown = (signal: string) => {
        logger.info(`${signal} received, shutting down`);
        server.close(async () => {
            await sequelize.close();
            process.exit(0);
        });
        setTimeout(() => process.exit(1), 10_000).unref();
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
};

process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { err: reason });
});

startServer();

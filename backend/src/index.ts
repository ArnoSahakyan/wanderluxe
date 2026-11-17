import { config } from './config/env';
import { logger } from './lib/logger';
import app from './app';
import { sequelize } from './db/models';

const startServer = async (): Promise<void> => {
    try {
        await sequelize.authenticate();
        logger.info('Database connected', { database: config.db.name ?? '(DATABASE_URL)' });
    } catch (err) {
        logger.error('Unable to connect to the database — is PostgreSQL running? (npm run db:up)', { err });
        process.exit(1);
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

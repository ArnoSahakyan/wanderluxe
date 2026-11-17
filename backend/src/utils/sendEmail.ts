import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config/env';
import { logger } from '../lib/logger';

interface SendEmailParams {
    to: string;
    subject: string;
    html: string;
}

let transporter: Transporter | undefined;

const getTransporter = (): Transporter => {
    if (transporter) return transporter;

    if (config.isTest) {
        // Tests never talk to a mail server; messages are captured in memory.
        transporter = nodemailer.createTransport({ jsonTransport: true });
    } else if (!config.mail.host) {
        logger.warn('SMTP_HOST is not set — e-mails will be logged instead of sent.');
        transporter = nodemailer.createTransport({ jsonTransport: true });
    } else {
        transporter = nodemailer.createTransport({
            host: config.mail.host,
            port: config.mail.port,
            secure: config.mail.secure,
            auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined,
        });
    }
    return transporter;
};

/** Messages sent while NODE_ENV=test (inspected by the test-suite). */
export const sentEmails: SendEmailParams[] = [];

export const sendEmail = async ({ to, subject, html }: SendEmailParams): Promise<void> => {
    if (config.isTest) {
        sentEmails.push({ to, subject, html });
        return;
    }
    try {
        await getTransporter().sendMail({ from: config.mail.from, to, subject, html });
        if (!config.mail.host) logger.info('E-mail (not sent, no SMTP configured)', { to, subject });
    } catch (err) {
        logger.error('E-mail sending failed', { err, subject });
        throw new Error('Failed to send email');
    }
};

import { Response } from 'express';
import { sendEmail, NotFoundError, getPagination, totalPages } from '../utils';
import { config } from '../config/env';
import { logger } from '../lib/logger';
import { IPaginationQuery, TypedRequest } from '../types';
import { generateContactMessageEmail } from "../emails";
import { Contact } from '../db/models';

interface ContactFormBody {
    full_name: string;
    email: string;
    phone_number: string;
    message: string;
}

interface UpdateStatusBody {
    status: 'unread' | 'read' | 'replied';
}

type ContactIdParam = {
    contact_id: number;
};

export const sendMessage = async (
    req: TypedRequest<{}, {}, ContactFormBody>,
    res: Response
) => {
    const { full_name, email, phone_number, message } = req.body;

    // Save to database
    await Contact.create({
        full_name,
        email,
        phone_number,
        message,
    });

    const html = generateContactMessageEmail({
        full_name,
        email,
        phone_number,
        message,
    });

    // The message is already stored (admin inbox), so a mail outage is logged, not fatal.
    if (config.mail.contactRecipient) {
        try {
            await sendEmail({ to: config.mail.contactRecipient, subject: 'New Customer Message', html });
        } catch (err) {
            logger.error('Contact notification e-mail failed', { err });
        }
    } else {
        logger.warn('CONTACT_RECIPIENT_EMAIL is not set; contact message stored without notification.');
    }

    res.status(200).json({ message: 'Message sent successfully.' });
};

export const getAllMessages = async (
    req: TypedRequest<{}, {}, {}, IPaginationQuery>,
    res: Response
): Promise<void> => {
    const { page, limit, offset } = getPagination(req.query);

    const { count, rows } = await Contact.findAndCountAll({
        order: [['created_at', 'DESC']],
        limit,
        offset,
    });

    res.status(200).json({
        total: count,
        page,
        totalPages: totalPages(count, limit),
        messages: rows,
    });
};

export const getMessageById = async (
    req: TypedRequest<ContactIdParam>,
    res: Response
): Promise<void> => {
    const contact = await Contact.findByPk(req.params.contact_id);

    if (!contact) {
        throw new NotFoundError('Message not found');
    }

    res.status(200).json(contact);
};

export const updateMessageStatus = async (
    req: TypedRequest<ContactIdParam, {}, UpdateStatusBody>,
    res: Response
): Promise<void> => {
    const { status } = req.body;

    const contact = await Contact.findByPk(req.params.contact_id);

    if (!contact) {
        throw new NotFoundError('Message not found');
    }

    contact.status = status;
    await contact.save();

    res.status(200).json(contact);
};

export const deleteMessage = async (
    req: TypedRequest<ContactIdParam>,
    res: Response
): Promise<void> => {
    const deleted = await Contact.destroy({ where: { contact_id: req.params.contact_id } });

    if (!deleted) {
        throw new NotFoundError('Message not found');
    }

    res.status(200).json({ message: 'Message deleted successfully' });
};

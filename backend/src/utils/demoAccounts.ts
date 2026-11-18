import { config } from '../config/env';

export type DemoRole = 'customer' | 'admin';

/** E-mail of the demo account for a role (see lib/demo.ts). */
export const demoEmail = (role: DemoRole) => (role === 'admin' ? config.demo.adminEmail : config.demo.customerEmail);

export const isDemoEmail = (email: string | null | undefined): boolean => {
    const value = email?.toLowerCase();
    return value === config.demo.adminEmail || value === config.demo.customerEmail;
};

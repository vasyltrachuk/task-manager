import { Client, Profile, Task } from './types';

export function isAdmin(user: Profile): boolean {
    return user.role === 'admin';
}

export function isAccountant(user: Profile): boolean {
    return user.role === 'accountant';
}

export function canManageClients(user: Profile): boolean {
    return isAdmin(user);
}

export function canManageLicenses(user: Profile): boolean {
    return isAdmin(user);
}

export function canManageTeam(user: Profile): boolean {
    return isAdmin(user);
}

export function canManageSettings(user: Profile): boolean {
    return isAdmin(user);
}

export function canAccessIntegrations(user: Profile): boolean {
    return isAdmin(user) || isAccountant(user);
}

export function canAccessBilling(user: Profile): boolean {
    return isAdmin(user) || isAccountant(user);
}

export function canCreateTask(user: Profile): boolean {
    return isAdmin(user) || isAccountant(user);
}

export function canViewClient(user: Profile, client: Client): boolean {
    if (isAdmin(user)) return true;
    if (!isAccountant(user)) return false;
    return Boolean(client.accountants?.some((accountant) => accountant.id === user.id));
}

export function canOperateTask(user: Profile, task: Task): boolean {
    if (isAdmin(user)) return true;
    if (!isAccountant(user)) return false;
    return task.assignee_id === user.id;
}

export function canManageBillingForClient(user: Profile, client: Client): boolean {
    if (isAdmin(user)) return true;
    if (!isAccountant(user)) return false;
    return canViewClient(user, client);
}

export function getVisibleClientsForUser(clients: Client[], user: Profile): Client[] {
    if (isAdmin(user)) return clients;
    if (!isAccountant(user)) return [];

    return clients.filter((client) => canViewClient(user, client));
}

export function getVisibleTasksForUser(tasks: Task[], user: Profile): Task[] {
    if (isAdmin(user)) return tasks;
    if (!isAccountant(user)) return [];

    return tasks.filter((task) => task.assignee_id === user.id);
}

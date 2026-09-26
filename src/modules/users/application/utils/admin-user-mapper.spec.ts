/// <reference types="jest" />

import { toAdminUserListItem } from '@/modules/users/application/utils/admin-user-mapper';

describe('admin-user-mapper', () => {
    it('returns a safe projection without Keycloak identity', () => {
        const projection = toAdminUserListItem({
            id: 'user-id',
            name: 'Admin',
            email: 'admin@example.com',
            phone: null,
            keycloakId: 'keycloak-secret-id',
            role: 'ADMIN' as never,
            status: 'ACTIVE' as never,
            avatarUrl: null,
            lastLoginAt: null,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        } as never);

        expect(projection).toEqual(
            expect.objectContaining({
                id: 'user-id',
                email: 'admin@example.com',
            }),
        );
        expect(projection).not.toHaveProperty('keycloakId');
    });
});

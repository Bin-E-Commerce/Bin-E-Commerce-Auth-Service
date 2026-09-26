import { Permission, PermissionScope } from '@common/auth';

export interface PermissionGrantDto {
    code: Permission;
    scopes: PermissionScope[];
}

export interface AccessNavigationItemDto {
    code: string;
    groupCode: string;
    groupLabel: string;
    groupOrder: number;
    label: string;
    description: string;
    href: string;
    icon: string;
    sortOrder: number;
    requiredPermissionCode: Permission;
}

export interface AccessAreaDto {
    canAccess: boolean;
    defaultRoute: string | null;
    navigation: AccessNavigationItemDto[];
}

export interface AccessProfileDto {
    permissionVersion: string;
    defaultRoute: string;
    areas: {
        admin: AccessAreaDto;
        seller: AccessAreaDto;
    };
}

export interface ViewerAccessDto {
    permissions: Permission[];
    permissionGrants: PermissionGrantDto[];
    accessProfile: AccessProfileDto;
}

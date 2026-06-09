export class SessionResponseDto {
  id: string;
  deviceName: string;
  deviceType: string;
  browser: string;
  os: string;
  loginMethod: string;
  ipAddress: string | null;
  location: string | null;
  userAgent: string | null;
  issuedAt: Date;
  lastActiveAt: Date | null;
  expiresAt: Date;
  clientId: string | null;
  isCurrent: boolean;
}

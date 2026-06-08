export class SessionResponseDto {
  id: string;
  issuedAt: Date;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  clientId: string | null;
  isCurrent: boolean;
}

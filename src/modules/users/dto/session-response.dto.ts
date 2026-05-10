export class SessionResponseDto {
  id: string;
  issuedAt: Date;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  isCurrent: boolean;
}

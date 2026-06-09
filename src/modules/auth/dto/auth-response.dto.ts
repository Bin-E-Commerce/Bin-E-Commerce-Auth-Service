import { User } from "../../../database/entities/user.entity";

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
  sessionId: string;
  user: Partial<User>;
}

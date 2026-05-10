import { User } from "../../../database/entities/user.entity";

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: Partial<User>;
}

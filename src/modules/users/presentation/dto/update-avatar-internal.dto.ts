import { IsUrl, MaxLength } from "class-validator";

export class UpdateAvatarInternalDto {
  @IsUrl()
  @MaxLength(500)
  avatarUrl: string;
}

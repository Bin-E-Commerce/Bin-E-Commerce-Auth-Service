import { IsString, IsNotEmpty } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class SocialCallbackDto {
  @ApiProperty({ description: "Authorization code returned by OAuth provider" })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({
    description: "CSRF state token issued by /auth/social/start/:provider",
  })
  @IsString()
  @IsNotEmpty()
  state: string;
}

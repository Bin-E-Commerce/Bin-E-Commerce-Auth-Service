import { IsString, IsOptional } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class RefreshDto {
  @ApiPropertyOptional({
    description:
      "Refresh token issued at login (optional — cookie is preferred)",
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

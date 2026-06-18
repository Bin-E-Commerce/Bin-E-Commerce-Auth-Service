import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
} from "class-validator";

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^0[3-9][0-9]{8}$/, { message: "Invalid Vietnamese phone number" })
  phone?: string;
}

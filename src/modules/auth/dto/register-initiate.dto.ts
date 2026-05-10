import {
  IsEmail,
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class RegisterInitiateDto {
  @ApiProperty({ example: "user@example.com", description: "Email address" })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({
    example: "Password1",
    description: "Min 8 chars, at least one uppercase letter and one digit",
    minLength: 8,
    maxLength: 100,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  @Matches(/^(?=.*[A-Z])(?=.*\d).+$/, {
    message:
      "Password must contain at least one uppercase letter and one digit",
  })
  password: string;

  @ApiProperty({
    example: "Nguyen Van A",
    description: "Full name",
    minLength: 2,
    maxLength: 100,
  })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    example: "0912345678",
    description: "Vietnamese phone number (0[3-9]xxxxxxxx)",
  })
  @IsOptional()
  @IsString()
  @Matches(/^0[3-9][0-9]{8}$/, { message: "Invalid Vietnamese phone number" })
  phone?: string;
}

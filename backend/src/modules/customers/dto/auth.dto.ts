import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

/**
 * Request shapes.
 *
 * `forbidNonWhitelisted` is on globally, so an unexpected property is rejected
 * rather than ignored. That is the backend half of "the checkout engine refuses
 * unknown fields": a client cannot smuggle `{ role: "admin" }` past a DTO.
 */

export class RequestCodeDto {
  @IsEmail({}, { message: 'email must be a valid address' })
  @MaxLength(254)
  email!: string;
}

export class VerifyCodeDto {
  @IsEmail({}, { message: 'email must be a valid address' })
  @MaxLength(254)
  email!: string;

  @IsString()
  @Length(6, 6, { message: 'code must be exactly 6 digits' })
  @Matches(/^\d{6}$/, { message: 'code must be exactly 6 digits' })
  code!: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(he|en)$/, { message: 'preferredLocale must be he or en' })
  preferredLocale?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(IL|US|UK|EU|GLOBAL)$/, { message: 'preferredRegion must be a known region code' })
  preferredRegion?: string;
}

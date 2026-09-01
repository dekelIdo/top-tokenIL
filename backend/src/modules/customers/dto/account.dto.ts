import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Account request shapes.
 *
 * Length is bounded on every password field. Without an upper bound a very long
 * string becomes a denial-of-service vector, because hashing cost grows with
 * input and the whole point of the algorithm is that it is slow.
 */

export class RegisterDto {
  @IsEmail({}, { message: 'email must be a valid address' })
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8, { message: 'password must be at least 8 characters' })
  @MaxLength(200)
  password!: string;
}

export class LoginDto {
  @IsEmail({}, { message: 'email must be a valid address' })
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;
}

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'email must be a valid address' })
  @MaxLength(254)
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  token!: string;

  @IsString()
  @MinLength(8, { message: 'password must be at least 8 characters' })
  @MaxLength(200)
  password!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MaxLength(200)
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: 'password must be at least 8 characters' })
  @MaxLength(200)
  newPassword!: string;
}

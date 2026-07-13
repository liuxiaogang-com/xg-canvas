import { IsEmail, IsString, Length, MinLength } from 'class-validator';

export class EmailCodeDto {
  @IsEmail()
  email: string;
}

export class EmailLoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(4, 8)
  code: string;
}

export class PhoneCodeDto {
  @IsString()
  @MinLength(5)
  phone: string;
}

export class PhoneLoginDto {
  @IsString()
  @MinLength(5)
  phone: string;

  @IsString()
  @Length(4, 8)
  code: string;
}

export class MagicDto {
  @IsEmail()
  email: string;
}

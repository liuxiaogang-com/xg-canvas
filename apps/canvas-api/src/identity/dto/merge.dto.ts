import { IsIn, IsString, Length, MinLength } from 'class-validator';

export class ConfirmCodeDto {
  @IsIn(['email', 'phone'])
  channel: 'email' | 'phone';

  @IsString()
  @MinLength(3)
  target: string;
}

export class MergeContactDto {
  @IsIn(['email', 'phone'])
  channel: 'email' | 'phone';

  @IsString()
  @MinLength(3)
  target: string;

  @IsString()
  @Length(4, 8)
  code: string;
}

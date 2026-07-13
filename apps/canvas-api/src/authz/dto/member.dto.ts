import { IsEmail, IsIn, IsOptional, IsString } from 'class-validator';

const PROJECT_ROLES = ['project_admin', 'project_member', 'project_guest'];

export class AddMemberDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsIn(PROJECT_ROLES)
  role: string;
}

export class ChangeRoleDto {
  @IsString()
  @IsIn(PROJECT_ROLES)
  role: string;
}

export class SetSystemRoleDto {
  @IsOptional()
  @IsIn(['sys_admin', 'it_super_admin', null])
  role: 'sys_admin' | 'it_super_admin' | null;
}

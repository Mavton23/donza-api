import { CommunityMemberStatus, CommunityBaseRole, CommunityMembershipType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '@/common/utils/pagination';
import { NormalizeEmail, ToBoolean, ToStringArray, Trim } from '@/common/utils/transform.decorators';

/** multipart entrega objectos como string JSON. */
const ToJson = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value) as unknown; } catch { return value; }
  });

const NormalizeTags = () =>
  Transform(({ value }: { value: unknown }) =>
    Array.isArray(value) ? [...new Set(value.map((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v)))] : value,
  );

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CreateCommunityDto {
  @Trim() @IsString() @MinLength(3, { message: 'O nome deve ter entre 3 e 50 caracteres' }) @MaxLength(50, { message: 'O nome deve ter entre 3 e 50 caracteres' })
  name: string;

  /** Opcional: gerado a partir do nome. Imutável depois de criado. */
  @IsOptional() @Trim() @MinLength(3) @MaxLength(60) @Matches(SLUG_RE, { message: 'slug só pode ter letras minúsculas, números e hífens' })
  slug?: string;

  @IsOptional() @Trim() @IsString() @MaxLength(5000)
  description?: string;

  @IsOptional() @Trim() @IsString() @MaxLength(100)
  shortDescription?: string;

  @IsOptional() @ToBoolean() @IsBoolean()
  isPublic?: boolean;

  @IsOptional() @IsEnum(CommunityMembershipType)
  membershipType?: CommunityMembershipType;

  @IsOptional() @ToStringArray() @NormalizeTags() @IsArray() @ArrayMaxSize(10, { message: 'No máximo 10 tags' }) @IsString({ each: true }) @MaxLength(20, { each: true, message: 'Cada tag tem no máximo 20 caracteres' })
  tags?: string[];

  /** { site: 'https://...', ... } — validado no serviço. */
  @IsOptional() @ToJson() @IsObject()
  socialLinks?: Record<string, string>;

  /** { guidelines, allowedContent, moderationPolicy } — validado no serviço. */
  @IsOptional() @ToJson() @IsObject()
  rules?: Record<string, string>;
}

export class UpdateCommunityDto {
  @IsOptional() @Trim() @IsString() @MinLength(3) @MaxLength(50)
  name?: string;

  @IsOptional() @Trim() @IsString() @MaxLength(5000)
  description?: string;

  @IsOptional() @Trim() @IsString() @MaxLength(100)
  shortDescription?: string;

  @IsOptional() @ToBoolean() @IsBoolean()
  isPublic?: boolean;

  @IsOptional() @IsEnum(CommunityMembershipType)
  membershipType?: CommunityMembershipType;

  @IsOptional() @ToStringArray() @NormalizeTags() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) @MaxLength(20, { each: true })
  tags?: string[];

  @IsOptional() @ToJson() @IsObject()
  socialLinks?: Record<string, string>;

  @IsOptional() @ToJson() @IsObject()
  rules?: Record<string, string>;

  /** Arquivar/reactivar (suspended é reservado à administração do site). */
  @IsOptional() @IsIn(['active', 'archived'])
  status?: 'active' | 'archived';

  @IsOptional() @ToBoolean() @IsBoolean()
  removeCover?: boolean;

  @IsOptional() @ToBoolean() @IsBoolean()
  removeThumbnail?: boolean;
}

export class ListCommunitiesQueryDto extends PaginationQueryDto {
  @IsOptional() @Trim() @IsString() @MaxLength(100)
  search?: string;

  @IsOptional() @Trim() @IsString() @MaxLength(20)
  tag?: string;

  @IsOptional() @IsIn(['public', 'private', 'all'])
  visibility?: 'public' | 'private' | 'all';

  @IsOptional() @IsIn(['newest', 'popular', 'name'])
  sort?: 'newest' | 'popular' | 'name';
}

export class MembersQueryDto extends PaginationQueryDto {
  @IsOptional() @Trim() @IsString() @MaxLength(50)
  search?: string;
}

export class UpdateMemberDto {
  @IsOptional() @IsIn([CommunityBaseRole.admin, CommunityBaseRole.moderator, CommunityBaseRole.member])
  role?: CommunityBaseRole;

  @IsOptional() @IsIn([CommunityMemberStatus.active, CommunityMemberStatus.muted, CommunityMemberStatus.banned])
  status?: CommunityMemberStatus;
}

export class InviteDto {
  @NormalizeEmail() @IsEmail()
  email: string;
}

export class PermissionsDto {
  @IsOptional() @IsBoolean() managePosts?: boolean;
  @IsOptional() @IsBoolean() manageEvents?: boolean;
  @IsOptional() @IsBoolean() inviteMembers?: boolean;
  @IsOptional() @IsBoolean() removeMembers?: boolean;
  @IsOptional() @IsBoolean() editCommunity?: boolean;
}

export class CreateRoleDto {
  @Trim() @IsString() @IsNotEmpty() @MaxLength(40)
  name: string;

  @Type(() => PermissionsDto) @ValidateNested() @IsObject()
  permissions: PermissionsDto;
}

export class UpdateRoleDto {
  @IsOptional() @Trim() @IsString() @IsNotEmpty() @MaxLength(40)
  name?: string;

  @IsOptional() @Type(() => PermissionsDto) @ValidateNested() @IsObject()
  permissions?: PermissionsDto;
}

export class AssignRolesDto {
  @IsArray() @ArrayMaxSize(20) @ArrayUnique() @IsUUID('all', { each: true })
  roleIds: string[];
}

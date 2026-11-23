import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { GroupPermissionGuard } from '../guards/group-permission.guard';

export const GROUP_PERMISSION_KEY = 'groupPermission';

/** Modelos cujo autor pode agir sobre o próprio conteúdo sem precisar da permissão. */
export type OwnerModel = 'discussionTopic' | 'discussionReply' | 'sharedContent' | 'groupTask';

export interface GroupPermissionMeta {
  /** Chave de topo em ModerationPermission.permissions (ex.: 'topics', 'members'). */
  resource: string;
  /** Acção dentro do recurso (ex.: 'delete', 'ban'). */
  action: string;
  /** Param da rota com o userId alvo (activa as regras de hierarquia, ex.: banir). */
  targetUserParam?: string;
  /** Permite também ao autor do conteúdo (param da rota com o id do conteúdo). */
  allowOwnerOf?: { model: OwnerModel; param: string };
}

/**
 * Substitui `moderationPermissions(action, resource)` e `groupModerator({ allowOwner })`.
 * Requer o param `:groupId` na rota.
 *
 * @example @GroupPermission('members', 'ban', { targetUserParam: 'userId' })
 * @example @GroupPermission('topics', 'delete', { allowOwnerOf: { model: 'discussionTopic', param: 'topicId' } })
 */
export const GroupPermission = (
  resource: string,
  action: string,
  options: Pick<GroupPermissionMeta, 'targetUserParam' | 'allowOwnerOf'> = {},
) =>
  applyDecorators(
    SetMetadata<string, GroupPermissionMeta>(GROUP_PERMISSION_KEY, { resource, action, ...options }),
    UseGuards(GroupPermissionGuard),
  );

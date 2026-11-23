import { Body, Controller, Delete, Get, Headers, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, OptionalAuth, RequireApproved } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import {
  CommentsQueryDto,
  CreateCommentDto,
  CreatePostDto,
  ListPostsQueryDto,
  MyPostsQueryDto,
  ReactionDto,
  UpdateCommentDto,
  UpdatePostDto,
} from './dto/post.dto';
import { PostCommentsService } from './post-comments.service';
import { PostReactionsService } from './post-reactions.service';
import { PostsService } from './posts.service';

const uuid = () => new ParseUUIDPipe();

/** `:communityId` aceita UUID ou slug. Rotas estáticas (`mine`) antes de `:postId`. */
@Controller('communities/:communityId/posts')
export class PostsController {
  constructor(
    private readonly posts: PostsService,
    private readonly reactions: PostReactionsService,
    private readonly comments: PostCommentsService,
  ) {}

  @OptionalAuth() @Get()
  list(@CurrentUser() user: AuthUser | undefined, @Param('communityId') cid: string, @Query() q: ListPostsQueryDto) {
    return this.posts.list(cid, user, q);
  }

  @Get('mine')
  mine(@CurrentUser() user: AuthUser, @Param('communityId') cid: string, @Query() q: MyPostsQueryDto) {
    return this.posts.mine(cid, user, q);
  }

  @RequireApproved() @Post()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  create(@CurrentUser() user: AuthUser, @Param('communityId') cid: string, @Body() dto: CreatePostDto) {
    return this.posts.create(cid, user, dto);
  }

  @OptionalAuth() @Get(':postId')
  detail(
    @CurrentUser() user: AuthUser | undefined,
    @Param('communityId') cid: string,
    @Param('postId', uuid()) postId: string,
    @Headers('user-agent') ua?: string,
  ) {
    return this.posts.getDetail(cid, postId, user, ua);
  }

  @Patch(':postId')
  update(@CurrentUser() user: AuthUser, @Param('communityId') cid: string, @Param('postId', uuid()) postId: string, @Body() dto: UpdatePostDto) {
    return this.posts.update(cid, postId, user, dto);
  }

  @Delete(':postId')
  remove(@CurrentUser() user: AuthUser, @Param('communityId') cid: string, @Param('postId', uuid()) postId: string) {
    return this.posts.remove(cid, postId, user);
  }

  // — reacções —
  @RequireApproved() @Put(':postId/reaction') @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  react(@CurrentUser() user: AuthUser, @Param('communityId') cid: string, @Param('postId', uuid()) postId: string, @Body() dto: ReactionDto) {
    return this.reactions.set(cid, postId, user, dto.type);
  }

  @Delete(':postId/reaction')
  unreact(@CurrentUser() user: AuthUser, @Param('communityId') cid: string, @Param('postId', uuid()) postId: string) {
    return this.reactions.remove(cid, postId, user);
  }

  @OptionalAuth() @Get(':postId/reaction/me')
  myReaction(@CurrentUser() user: AuthUser | undefined, @Param('communityId') cid: string, @Param('postId', uuid()) postId: string) {
    return this.reactions.mine(cid, postId, user);
  }

  @OptionalAuth() @Get(':postId/reactions')
  reactionList(@CurrentUser() user: AuthUser | undefined, @Param('communityId') cid: string, @Param('postId', uuid()) postId: string) {
    return this.reactions.list(cid, postId, user);
  }

  // — comentários —
  @OptionalAuth() @Get(':postId/comments')
  commentList(@CurrentUser() user: AuthUser | undefined, @Param('communityId') cid: string, @Param('postId', uuid()) postId: string, @Query() q: CommentsQueryDto) {
    return this.comments.list(cid, postId, user, q);
  }

  @OptionalAuth() @Get(':postId/comments/:commentId/replies')
  replies(
    @CurrentUser() user: AuthUser | undefined,
    @Param('communityId') cid: string,
    @Param('postId', uuid()) postId: string,
    @Param('commentId', uuid()) commentId: string,
    @Query() q: CommentsQueryDto,
  ) {
    return this.comments.replies(cid, postId, commentId, user, q);
  }

  @RequireApproved() @Post(':postId/comments')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  comment(@CurrentUser() user: AuthUser, @Param('communityId') cid: string, @Param('postId', uuid()) postId: string, @Body() dto: CreateCommentDto) {
    return this.comments.create(cid, postId, user, dto);
  }

  @Patch(':postId/comments/:commentId')
  editComment(
    @CurrentUser() user: AuthUser,
    @Param('communityId') cid: string,
    @Param('postId', uuid()) postId: string,
    @Param('commentId', uuid()) commentId: string,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.comments.update(cid, postId, commentId, user, dto);
  }

  @Delete(':postId/comments/:commentId')
  deleteComment(@CurrentUser() user: AuthUser, @Param('communityId') cid: string, @Param('postId', uuid()) postId: string, @Param('commentId', uuid()) commentId: string) {
    return this.comments.remove(cid, postId, commentId, user);
  }
}

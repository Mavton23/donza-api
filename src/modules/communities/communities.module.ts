import { Module } from '@nestjs/common';
import { CommunitiesController } from './communities.controller';
import { CommunitiesService } from './communities.service';
import { CommunityMembersController } from './community-members.controller';
import { CommunityMembersService } from './community-members.service';
import { PostAccessService } from './posts/post-access.service';
import { PostCommentsService } from './posts/post-comments.service';
import { PostReactionsService } from './posts/post-reactions.service';
import { PostsController } from './posts/posts.controller';
import { PostsService } from './posts/posts.service';

@Module({
  // `communities/me` e `:idOrSlug` primeiro; os sub-recursos têm caminhos mais longos.
  controllers: [CommunitiesController, CommunityMembersController, PostsController],
  providers: [CommunitiesService, CommunityMembersService, PostAccessService, PostsService, PostReactionsService, PostCommentsService],
  exports: [CommunitiesService, CommunityMembersService],
})
export class CommunitiesModule {}

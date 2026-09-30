import 'package:flutter/material.dart';

import '../api/api_failure.dart';
import '../api/post_client.dart';
import '../app/theme.dart';
import '../posts/post_pager.dart';
import '../posts/post_preview_card.dart';
import '../ui/dayli_button.dart';

/// One profile's posts, newest day first. The API decides what the viewer may
/// see: everything on your own profile, released friends posts on a friend's.
class ProfilePostsController extends PostPager<ProfilePost> {
  ProfilePostsController(PostClient client, String username)
    : super(
        ({cursor}) => client.profilePage(username, cursor: cursor),
        (post) => post.id,
      );
}

/// Only the author sees solo and unreleased posts, so only they need a label.
String? _labelFor(ProfilePost post) {
  if (!post.released) return 'Not released yet';
  if (post.audience == 'solo') return 'Only you';
  return null;
}

class ProfilePostsSection extends StatelessWidget {
  const ProfilePostsSection({
    super.key,
    required this.posts,
    required this.displayName,
    required this.isMe,
  });

  final ProfilePostsController posts;
  final String displayName;
  final bool isMe;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: posts,
      builder: (context, _) => _build(context),
    );
  }

  Widget _build(BuildContext context) {
    final colors = DayliColors.of(context);
    final muted = DayliText.sans(
      context,
      size: DayliTextSize.sm,
      color: colors.foregroundSecondary,
    );

    if (!posts.loaded) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 40),
        child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
      );
    }

    final failure = posts.failure;
    if (posts.posts.isEmpty && failure != null) {
      return Column(
        children: [
          Text(
            failure is NetworkUnavailable
                ? "You're offline, so these daylies couldn't load."
                : "These daylies couldn't be loaded.",
            key: const Key('profile.posts.error'),
            textAlign: TextAlign.center,
            style: muted,
          ),
          const SizedBox(height: 16),
          DayliButton(
            key: const Key('profile.posts.retry'),
            label: 'Try again',
            color: ButtonColor.foreground,
            height: 44,
            onPressed: posts.refresh,
          ),
        ],
      );
    }

    if (posts.posts.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 12),
        child: Text(
          isMe
              ? "You haven't posted a dayli yet. Your daylies will be kept here."
              : "$displayName hasn't shared any daylies with you yet.",
          key: const Key('profile.posts.empty'),
          textAlign: TextAlign.center,
          style: DayliText.serif(
            context,
            size: DayliTextSize.lg,
            weight: FontWeight.w500,
            tracking: DayliTracking.tight,
            color: colors.foregroundSecondary,
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (failure != null) ...[
          Text(
            failure is NetworkUnavailable
                ? "You're offline. These are the daylies you last loaded."
                : "Couldn't refresh. These are the daylies you last loaded.",
            key: const Key('profile.posts.stale'),
            style: muted,
          ),
          const SizedBox(height: 12),
        ],
        for (final post in posts.posts) ...[
          PostPreviewCard(
            key: Key('profile.posts.post.${post.id}'),
            post: post,
            keyPrefix: 'profile.posts',
            label: _labelFor(post),
          ),
          const SizedBox(height: 16),
        ],
        if (posts.moreFailure != null) ...[
          Text(
            "More daylies couldn't be loaded.",
            key: const Key('profile.posts.moreError'),
            textAlign: TextAlign.center,
            style: muted,
          ),
          const SizedBox(height: 8),
        ],
        if (posts.hasMore)
          Center(
            child: DayliButton(
              key: const Key('profile.posts.more'),
              label: posts.loadingMore ? 'Loading...' : 'Load more',
              color: ButtonColor.foreground,
              height: 44,
              onPressed: posts.loadingMore ? null : posts.loadMore,
            ),
          ),
      ],
    );
  }
}

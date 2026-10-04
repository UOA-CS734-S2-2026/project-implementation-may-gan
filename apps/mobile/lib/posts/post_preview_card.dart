import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/feed_client.dart';
import '../app/theme.dart';
import '../ui/post_dates.dart';
import '../ui/surfaces.dart';
import 'private_media.dart';

/// A post cut to a preview; tapping anywhere on it opens the full post.
class PostPreviewCard extends StatelessWidget {
  const PostPreviewCard({
    super.key,
    required this.post,
    required this.keyPrefix,
    this.label,
    this.linkAuthor = true,
    this.onChanged,
  });

  final FeedPost post;

  /// Scopes the widget keys, such as `home.feed.answer.<id>`.
  final String keyPrefix;

  /// A short note for the author, such as who can see the post.
  final String? label;

  /// Whether the author row opens their profile. Off on that profile itself.
  final bool linkAuthor;

  /// Called after the opened post was edited or deleted, so the list that
  /// shows this card can refresh.
  final VoidCallback? onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final initial = post.displayName.isEmpty
        ? '?'
        : post.displayName.characters.first.toUpperCase();
    final card = DayliCard(
      padding: const EdgeInsets.all(18),
      radius: 18,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: _AuthorLink(
                  key: Key('$keyPrefix.author.${post.id}'),
                  username: post.username,
                  displayName: post.displayName,
                  enabled: linkAuthor,
                  child: Row(
                    children: [
                      CircleAvatar(
                        radius: 18,
                        backgroundColor: colors.backgroundAccent,
                        child: Text(
                          initial,
                          style: DayliText.sans(
                            context,
                            size: DayliTextSize.sm,
                            weight: FontWeight.w600,
                            color: colors.foregroundAccent,
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Flexible(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              post.displayName,
                              overflow: TextOverflow.ellipsis,
                              style: DayliText.sans(
                                context,
                                size: DayliTextSize.sm,
                                weight: FontWeight.w600,
                              ),
                            ),
                            Text(
                              '@${post.username}',
                              overflow: TextOverflow.ellipsis,
                              style: DayliText.sans(
                                context,
                                size: DayliTextSize.xs,
                                color: colors.foregroundSecondary,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              Text(
                '${shortDayLabel(post.localDate)} · ${post.rating}/10',
                style: DayliText.sans(
                  context,
                  size: DayliTextSize.xs,
                  color: colors.foregroundSecondary,
                ),
              ),
            ],
          ),
          if (post.media.firstOrNull case final media?) ...[
            const SizedBox(height: 14),
            Container(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: colors.foreground.withValues(alpha: 0.1),
                ),
                boxShadow: DayliShadows.md,
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: AspectRatio(
                  aspectRatio: 1,
                  child: media.isVideo
                      // Videos play on the post itself, never in the feed.
                      ? Semantics(
                          key: Key('$keyPrefix.video.${post.id}'),
                          label: 'Video',
                          excludeSemantics: true,
                          child: ColoredBox(
                            color: colors.foreground,
                            child: const Icon(
                              Icons.play_circle_outline_rounded,
                              size: 48,
                              color: Colors.white,
                            ),
                          ),
                        )
                      : PrivateImage(
                          key: Key('$keyPrefix.photo.${post.id}'),
                          postId: post.id,
                          media: media,
                          semanticLabel: "${post.displayName}'s photo",
                        ),
                ),
              ),
            ),
          ],
          const SizedBox(height: 14),
          Text(
            post.promptText,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: DayliText.sans(
              context,
              size: DayliTextSize.xs,
              weight: FontWeight.w500,
              color: colors.foregroundTertiary,
            ),
          ),
          const SizedBox(height: 6),
          // Whole lines only; the full answer and word dump are on the post.
          Text(
            post.reflectiveAnswer,
            key: Key('$keyPrefix.answer.${post.id}'),
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
            style: DayliText.serif(
              context,
              size: DayliTextSize.lg,
              weight: FontWeight.w500,
              tracking: DayliTracking.tight,
            ),
          ),
          if (post.edited || label != null) ...[
            const SizedBox(height: 10),
            Text(
              [?label, if (post.edited) 'Edited'].join(' · '),
              key: Key('$keyPrefix.label.${post.id}'),
              style: DayliText.sans(
                context,
                size: DayliTextSize.xs,
                color: colors.foregroundTertiary,
              ),
            ),
          ],
          const SizedBox(height: 10),
          Semantics(
            key: Key('$keyPrefix.counts.${post.id}'),
            container: true,
            excludeSemantics: true,
            label: [
              post.likeCount == 1 ? '1 like' : '${post.likeCount} likes',
              if (post.viewerHasLiked) 'including yours',
              post.commentCount == 1
                  ? '1 comment'
                  : '${post.commentCount} comments',
            ].join(', '),
            child: Row(
              children: [
                Icon(
                  post.viewerHasLiked
                      ? Icons.favorite_rounded
                      : Icons.favorite_border_rounded,
                  size: 16,
                  color: post.viewerHasLiked
                      ? colors.foregroundAccent
                      : colors.foregroundTertiary,
                ),
                const SizedBox(width: 4),
                Text('${post.likeCount}', style: _countStyle(context)),
                const SizedBox(width: 12),
                Icon(
                  Icons.mode_comment_outlined,
                  size: 16,
                  color: colors.foregroundTertiary,
                ),
                const SizedBox(width: 4),
                Text('${post.commentCount}', style: _countStyle(context)),
              ],
            ),
          ),
        ],
      ),
    );
    return Semantics(
      button: true,
      label: 'Open ${post.displayName}\'s dayli',
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () async {
          final changed = await context.push<bool>('/posts/${post.id}');
          if (changed == true) onChanged?.call();
        },
        child: card,
      ),
    );
  }
}

/// Opens the author's profile on its own tap, above the card's tap.
class _AuthorLink extends StatelessWidget {
  const _AuthorLink({
    super.key,
    required this.username,
    required this.displayName,
    required this.enabled,
    required this.child,
  });

  final String username;
  final String displayName;
  final bool enabled;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (!enabled) return child;
    return Semantics(
      button: true,
      label: "Open $displayName's profile",
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => context.push('/u/${Uri.encodeComponent(username)}'),
        child: child,
      ),
    );
  }
}

TextStyle _countStyle(BuildContext context) => DayliText.sans(
  context,
  size: DayliTextSize.xs,
  color: DayliColors.of(context).foregroundTertiary,
);

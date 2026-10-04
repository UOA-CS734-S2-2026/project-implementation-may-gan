import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/api_failure.dart';
import '../api/interactions_client.dart';
import '../app/app_scope.dart';
import '../app/theme.dart';

/// The people who liked a post, newest first, read from the server on every
/// open so a revoked post shows nothing.
class PostLikersScreen extends StatefulWidget {
  const PostLikersScreen({super.key, required this.postId});

  final String postId;

  @override
  State<PostLikersScreen> createState() => _PostLikersScreenState();
}

class _PostLikersScreenState extends State<PostLikersScreen> {
  final _likes = <PostLike>[];
  String? _nextCursor;
  bool _loading = true;
  bool _loadingMore = false;
  ApiFailure? _failure;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_loading && _likes.isEmpty && _failure == null) _load();
  }

  Future<void> _load({String? cursor}) async {
    final result = await AppScope.of(
      context,
    ).interactions.likes(widget.postId, cursor: cursor);
    if (!mounted) return;
    setState(() {
      _loading = false;
      _loadingMore = false;
      switch (result) {
        case ApiSuccess(:final value):
          if (cursor == null) _likes.clear();
          _likes.addAll(value.items);
          _nextCursor = value.hasMore ? value.nextCursor : null;
          _failure = null;
        case ApiError(:final failure):
          _failure = failure;
          if (failure is NotFound) _likes.clear();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final muted = DayliText.sans(
      context,
      size: DayliTextSize.sm,
      color: colors.foregroundSecondary,
    );
    return Scaffold(
      backgroundColor: colors.background,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(4, 4, 4, 32),
          children: [
            Row(
              children: [
                IconButton(
                  tooltip: 'Back',
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.arrow_back_rounded),
                ),
                Text(
                  'liked by',
                  style: DayliText.serif(
                    context,
                    size: DayliTextSize.xl,
                    weight: FontWeight.w600,
                    tracking: DayliTracking.tight,
                  ),
                ),
              ],
            ),
            if (_loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 80),
                child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
              )
            else if (_likes.isEmpty)
              Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  switch (_failure) {
                    NotFound() => "Likes aren't available.",
                    null => 'No likes yet.',
                    _ => "Likes couldn't be loaded.",
                  },
                  key: const Key('likers.message'),
                  style: muted,
                ),
              )
            else ...[
              for (final like in _likes)
                ListTile(
                  key: Key('likers.${like.person.id}'),
                  leading: CircleAvatar(
                    backgroundColor: colors.backgroundAccent,
                    child: Text(
                      like.person.displayName.characters.first.toUpperCase(),
                      style: DayliText.sans(
                        context,
                        weight: FontWeight.w600,
                        color: colors.foregroundAccent,
                      ),
                    ),
                  ),
                  title: Text(like.person.displayName),
                  subtitle: Text('@${like.person.username}'),
                  onTap: () => context.go(
                    '/u/${Uri.encodeComponent(like.person.username)}',
                  ),
                ),
              if (_nextCursor case final cursor?)
                TextButton(
                  key: const Key('likers.more'),
                  onPressed: _loadingMore
                      ? null
                      : () {
                          setState(() => _loadingMore = true);
                          _load(cursor: cursor);
                        },
                  child: Text(_loadingMore ? 'Loading...' : 'Show more'),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

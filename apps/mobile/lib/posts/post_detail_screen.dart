import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/api_failure.dart';
import '../api/post_client.dart';
import '../app/app_scope.dart';
import '../app/theme.dart';
import '../ui/dayli_button.dart';
import '../ui/post_dates.dart';
import '../ui/surfaces.dart';

import 'edit_post_screen.dart';
import 'post_revisions_screen.dart';
import 'private_media.dart';

/// One post, opened from the feed. Every open and refresh asks the server
/// again, so a post that was deleted or whose access was revoked is replaced
/// by the unavailable state rather than shown from memory.
class PostDetailScreen extends StatefulWidget {
  const PostDetailScreen({super.key, required this.postId});

  final String postId;

  @override
  State<PostDetailScreen> createState() => _PostDetailScreenState();
}

class _PostDetailScreenState extends State<PostDetailScreen> {
  ApiResult<PostDetail>? _result;
  PostDetail? _post;

  /// True once the post was edited or deleted here. It is returned to the
  /// list that opened the post, so that list can refresh.
  bool _changed = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_result == null) _load();
  }

  Future<void> _load() async {
    final services = AppScope.of(context);
    final result = await services.posts.get(widget.postId);
    if (!mounted) return;
    if (result case ApiError(failure: Unauthenticated())) {
      await services.session.sessionExpired();
      return;
    }
    setState(() {
      _result = result;
      switch (result) {
        case ApiSuccess(:final value):
          _post = value;
        case ApiError(failure: NotFound()):
          _post = null;
        case ApiError():
          // A transient failure keeps what was already on screen.
          break;
      }
    });
  }

  Future<void> _edit(PostDetail post) async {
    final saved = await Navigator.of(context).push<PostDetail>(
      MaterialPageRoute(builder: (_) => EditPostScreen(post: post)),
    );
    if (saved == null || !mounted) return;
    setState(() {
      _changed = true;
      _post = saved;
      _result = ApiSuccess(saved);
    });
  }

  Future<void> _history(PostDetail post) => Navigator.of(context).push<void>(
    MaterialPageRoute(
      builder: (_) => PostRevisionsScreen(
        postId: post.id,
        viewerIsAuthor: post.viewerIsAuthor,
      ),
    ),
  );

  Future<void> _confirmDelete(PostDetail post) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        key: const Key('post.deleteDialog'),
        title: const Text('Delete this dayli?'),
        content: const Text(
          'It disappears for you and your friends straight away. If it was '
          "today's dayli, you can post a new one before midnight.",
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            key: const Key('post.deleteDialog.confirm'),
            onPressed: () => Navigator.of(context).pop(true),
            style: TextButton.styleFrom(
              foregroundColor: DayliColors.of(context).danger,
            ),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    final services = AppScope.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final result = await services.posts.delete(post.id);
    if (!mounted) return;
    switch (result) {
      // Already gone counts as deleted.
      case ApiSuccess() || ApiError(failure: NotFound()):
        messenger.showSnackBar(
          const SnackBar(
            key: Key('post.deleted'),
            content: Text('Dayli deleted.'),
          ),
        );
        _changed = true;
        _leave();
      case ApiError(failure: Unauthenticated()):
        await services.session.sessionExpired();
      case ApiError(:final failure):
        messenger.showSnackBar(
          SnackBar(
            key: const Key('post.deleteFailed'),
            content: Text(
              failure is NetworkUnavailable
                  ? "You're offline, so this dayli wasn't deleted."
                  : "This dayli couldn't be deleted. Try again.",
            ),
          ),
        );
    }
  }

  void _leave() => context.canPop() ? context.pop(_changed) : context.go('/me');

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _leave();
      },
      child: Scaffold(
        backgroundColor: colors.background,
        body: SafeArea(
          child: RefreshIndicator(
            color: colors.foregroundAccent,
            onRefresh: _load,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(4, 4, 4, 32),
              children: [
                Row(
                  children: [
                    IconButton(
                      tooltip: 'Back',
                      onPressed: _leave,
                      icon: const Icon(Icons.arrow_back_rounded),
                    ),
                    Text(
                      'dayli',
                      style: DayliText.serif(
                        context,
                        size: DayliTextSize.xl,
                        weight: FontWeight.w600,
                        tracking: DayliTracking.tight,
                      ),
                    ),
                  ],
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                  child: _body(context),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _body(BuildContext context) {
    final colors = DayliColors.of(context);
    final muted = DayliText.sans(
      context,
      size: DayliTextSize.sm,
      color: colors.foregroundSecondary,
    );
    final post = _post;
    final result = _result;

    if (result == null) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 80),
        child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
      );
    }

    if (post == null) {
      if (result case ApiError(failure: NotFound())) {
        return _Message(
          key: const Key('post.unavailable'),
          text:
              "This dayli isn't available. It may have been deleted, or you "
              'may no longer have access.',
        );
      }
      final failure = (result as ApiError).failure;
      return Column(
        children: [
          _Message(
            key: const Key('post.error'),
            text: failure is NetworkUnavailable
                ? "You're offline, so this dayli couldn't load."
                : "This dayli couldn't be loaded.",
          ),
          const SizedBox(height: 16),
          DayliButton(
            key: const Key('post.retry'),
            label: 'Try again',
            color: ButtonColor.foreground,
            height: 44,
            onPressed: _load,
          ),
        ],
      );
    }

    final stale = result is ApiError<PostDetail>;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (stale) ...[
          Text(
            "Couldn't refresh. This is the version you last loaded.",
            key: const Key('post.stale'),
            style: muted,
          ),
          const SizedBox(height: 12),
        ],
        DayliCard(
          padding: const EdgeInsets.all(20),
          radius: 20,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Semantics(
                      button: true,
                      label: "Open ${post.displayName}'s profile",
                      child: GestureDetector(
                        key: const Key('post.author'),
                        behavior: HitTestBehavior.opaque,
                        // The post sits above the tab shell, so a pushed
                        // profile would clash with the shell's navigator.
                        onTap: () => context.go(
                          '/u/${Uri.encodeComponent(post.username)}',
                        ),
                        child: Row(
                          children: [
                            CircleAvatar(
                              radius: 22,
                              backgroundColor: colors.backgroundAccent,
                              child: Text(
                                post.displayName.isEmpty
                                    ? '?'
                                    : post.displayName.characters.first
                                          .toUpperCase(),
                                style: DayliText.sans(
                                  context,
                                  weight: FontWeight.w600,
                                  color: colors.foregroundAccent,
                                ),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Flexible(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    post.displayName,
                                    overflow: TextOverflow.ellipsis,
                                    style: DayliText.sans(
                                      context,
                                      weight: FontWeight.w600,
                                    ),
                                  ),
                                  Text(
                                    '@${post.username}',
                                    overflow: TextOverflow.ellipsis,
                                    style: muted,
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  Semantics(
                    container: true,
                    label: 'Rated ${post.rating} out of 10',
                    excludeSemantics: true,
                    child: Text(
                      '${post.rating}/10',
                      style: DayliText.sans(
                        context,
                        weight: FontWeight.w600,
                        color: colors.foregroundAccent,
                      ),
                    ),
                  ),
                  if (post.viewerIsAuthor && !stale)
                    PopupMenuButton<String>(
                      key: const Key('post.menu'),
                      tooltip: 'Post options',
                      onSelected: (action) =>
                          action == 'edit' ? _edit(post) : _confirmDelete(post),
                      itemBuilder: (context) => const [
                        PopupMenuItem(
                          key: Key('post.edit'),
                          value: 'edit',
                          child: Text('Edit'),
                        ),
                        PopupMenuItem(
                          key: Key('post.delete'),
                          value: 'delete',
                          child: Text('Delete'),
                        ),
                      ],
                    ),
                ],
              ),
              const SizedBox(height: 14),
              Text(
                [
                  longDayLabel(post.localDate),
                  if (post.viewerIsAuthor)
                    post.audience == 'solo' ? 'Only you' : 'Friends',
                ].join(' · '),
                key: const Key('post.meta'),
                style: muted,
              ),
              if (post.edited)
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton(
                    key: const Key('post.history'),
                    style: TextButton.styleFrom(
                      padding: EdgeInsets.zero,
                      minimumSize: const Size(0, 44),
                      foregroundColor: colors.foregroundSecondary,
                    ),
                    onPressed: () => _history(post),
                    child: Text(
                      'Edited · see earlier versions',
                      style: muted.copyWith(
                        decoration: TextDecoration.underline,
                      ),
                    ),
                  ),
                ),
              if (post.media.isNotEmpty) ...[
                const SizedBox(height: 16),
                _PostMedia(post: post),
              ],
              const SizedBox(height: 18),
              Text(
                post.promptText,
                style: DayliText.sans(
                  context,
                  size: DayliTextSize.sm,
                  weight: FontWeight.w500,
                  color: colors.foregroundTertiary,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                post.reflectiveAnswer,
                style: DayliText.serif(
                  context,
                  size: DayliTextSize.xl,
                  weight: FontWeight.w500,
                  tracking: DayliTracking.tight,
                ),
              ),
              if (post.caption case final caption?) ...[
                const SizedBox(height: 18),
                Text(
                  'Word dump',
                  style: DayliText.sans(
                    context,
                    size: DayliTextSize.sm,
                    weight: FontWeight.w500,
                    color: colors.foregroundTertiary,
                  ),
                ),
                const SizedBox(height: 6),
                Text(caption, style: DayliText.sans(context)),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

/// One video, or up to three photos, each from a private, expiring URL.
class _PostMedia extends StatelessWidget {
  const _PostMedia({required this.post});

  final PostDetail post;

  @override
  Widget build(BuildContext context) {
    final first = post.media.first;
    if (first.isVideo) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: AspectRatio(
          aspectRatio: 1,
          child: PrivateVideo(
            postId: post.id,
            media: first,
            semanticLabel: "${post.displayName}'s video",
          ),
        ),
      );
    }
    return Column(
      children: [
        for (final (index, media) in post.media.indexed) ...[
          if (index > 0) const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: AspectRatio(
              aspectRatio: 1,
              child: PrivateImage(
                key: Key('post.photo.$index'),
                postId: post.id,
                media: media,
                semanticLabel:
                    "${post.displayName}'s photo ${index + 1} of ${post.media.length}",
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({super.key, required this.text});

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 60, horizontal: 12),
    child: Text(
      text,
      textAlign: TextAlign.center,
      style: DayliText.serif(
        context,
        size: DayliTextSize.lg,
        weight: FontWeight.w500,
        tracking: DayliTracking.tight,
        color: DayliColors.of(context).foregroundSecondary,
      ),
    ),
  );
}

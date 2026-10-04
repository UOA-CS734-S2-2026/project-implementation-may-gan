import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/api_failure.dart';
import '../api/post_client.dart';
import '../app/app_scope.dart';
import '../app/theme.dart';
import '../auth/public_return_intent.dart';
import '../auth/session_controller.dart';
import '../ui/dayli_button.dart';
import '../ui/post_dates.dart';
import '../ui/surfaces.dart';
import '../ui/voice_player.dart';

import 'edit_post_screen.dart';
import 'post_comments.dart';
import 'post_likers_screen.dart';
import 'post_revisions_screen.dart';
import 'private_media.dart';

/// One post, opened from the feed. Every open and refresh asks the server
/// again, so a post that was deleted or whose access was revoked is replaced
/// by the unavailable state rather than shown from memory.
class PostDetailScreen extends StatefulWidget {
  const PostDetailScreen({
    super.key,
    required this.postId,
    this.intent,
    this.intentActorId,
  });

  final String postId;
  final PublicActionIntent? intent;
  final String? intentActorId;

  @override
  State<PostDetailScreen> createState() => _PostDetailScreenState();
}

class _PostDetailScreenState extends State<PostDetailScreen> {
  ApiResult<PostDetail>? _result;
  PostDetail? _post;
  SessionController? _session;
  (SessionStatus, String?, int)? _sessionIdentity;
  String? _loadedPostId;
  int _requestGeneration = 0;

  /// The intent this visit came back with, once it has been consumed.
  PublicActionIntent? _consumedIntent;

  /// True once the post was edited, deleted, liked, unliked, or commented on
  /// here. It is returned to the list that opened the post, so that list can
  /// refresh its counts.
  bool _changed = false;

  /// Changes on every load, so the comments reload with the post.
  int _loads = 0;
  bool _liking = false;

  /// Changes whenever a like starts, so an older read of the post can't
  /// overwrite a newer like.
  int _likeVersion = 0;

  /// Changes whenever the counts are read again, so only the newest read is
  /// shown and an older answer can't overwrite a newer comment's count.
  int _countsVersion = 0;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final session = AppScope.of(context).session;
    if (_session != session) {
      _session?.removeListener(_onSessionChanged);
      _session = session..addListener(_onSessionChanged);
    }
    _syncActor();
  }

  void _onSessionChanged() {
    if (!mounted) return;
    _syncActor();
  }

  void _syncActor({bool force = false}) {
    final identity = _currentSessionIdentity();
    if (force ||
        identity != _sessionIdentity ||
        _loadedPostId != widget.postId) {
      _sessionIdentity = identity;
      _loadedPostId = widget.postId;
      _post = null;
      _result = null;
      _consumedIntent =
          widget.intent != null &&
              _session?.status == SessionStatus.signedIn &&
              widget.intentActorId == _session?.user?.id
          ? widget.intent
          : null;
      _load();
      if (mounted) setState(() {});
    }
  }

  (SessionStatus, String?, int) _currentSessionIdentity() {
    final session = _session!;
    return (session.status, session.user?.id, session.generation);
  }

  bool _isCurrentLoad(
    int requestGeneration,
    String postId,
    (SessionStatus, String?, int) identity,
  ) =>
      mounted &&
      requestGeneration == _requestGeneration &&
      postId == widget.postId &&
      identity == _currentSessionIdentity();

  @override
  void didUpdateWidget(covariant PostDetailScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.postId != widget.postId ||
        oldWidget.intent != widget.intent ||
        oldWidget.intentActorId != widget.intentActorId) {
      _syncActor(force: true);
    }
  }

  @override
  void dispose() {
    _session?.removeListener(_onSessionChanged);
    super.dispose();
  }

  Future<void> _load() async {
    final services = AppScope.of(context);
    final requestGeneration = ++_requestGeneration;
    final postId = widget.postId;
    final identity = _currentSessionIdentity();
    final result = await services.posts.get(postId);
    if (!_isCurrentLoad(requestGeneration, postId, identity)) return;
    if (result case ApiError(failure: Unauthenticated())) {
      if (identity.$1 == SessionStatus.signedIn) {
        await services.session.sessionExpired();
      }
      return;
    }
    if (!_isCurrentLoad(requestGeneration, postId, identity)) return;
    setState(() {
      _result = result;
      _loads++;
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

  /// Shows the like at once, then keeps the server's count, or puts it back.
  Future<void> _toggleLike(PostDetail post) async {
    final liked = !post.viewerHasLiked;
    final messenger = ScaffoldMessenger.of(context);
    setState(() {
      _liking = true;
      _likeVersion++;
      _post = post.copyWith(
        likeCount: (post.likeCount + (liked ? 1 : -1)).clamp(0, 1 << 31),
        viewerHasLiked: liked,
      );
    });
    final result = await AppScope.of(context).interactions
        .setLike(post.id, liked: liked);
    if (!mounted) return;
    setState(() {
      _liking = false;
      final current = _post;
      switch (result) {
        case ApiSuccess(:final value):
          _changed = true;
          if (current != null) {
            _post = current.copyWith(
              likeCount: value.likeCount,
              viewerHasLiked: value.viewerHasLiked,
            );
          }
        case ApiError():
          if (current != null) {
            _post = current.copyWith(
              likeCount: post.likeCount,
              viewerHasLiked: post.viewerHasLiked,
            );
          }
      }
    });
    if (result is ApiError) {
      messenger.showSnackBar(
        const SnackBar(
          key: Key('post.likeFailed'),
          content: Text("Your like couldn't be saved. Try again."),
        ),
      );
    }
  }

  /// Reads the post's counts again after a comment changes, because only the
  /// server counts comments on pages that aren't loaded. If the post is gone,
  /// the screen says so instead of showing it from memory.
  Future<void> _refreshCounts() async {
    // A comment was added or deleted, so the list that opened the post is stale.
    _changed = true;
    final services = AppScope.of(context);
    final likeVersion = _likeVersion;
    final version = ++_countsVersion;
    final result = await services.posts.get(widget.postId);
    // A newer read started after this one, so its answer, including a 404,
    // is the one that counts.
    if (!mounted || version != _countsVersion) return;
    switch (result) {
      case ApiSuccess(:final value):
        final post = _post;
        if (post == null) return;
        // A like saved or started after this read began is newer than it.
        final likeIsCurrent = !_liking && likeVersion == _likeVersion;
        setState(
          () => _post = post.copyWith(
            likeCount: likeIsCurrent ? value.likeCount : post.likeCount,
            viewerHasLiked: likeIsCurrent
                ? value.viewerHasLiked
                : post.viewerHasLiked,
            commentCount: value.commentCount,
          ),
        );
      case ApiError(failure: NotFound()):
        setState(() {
          _result = result;
          _post = null;
        });
      case ApiError(failure: Unauthenticated()):
        await services.session.sessionExpired();
      case ApiError():
        // The count is refreshed again after the next change.
        break;
    }
  }

  Future<void> _edit(PostDetail post) async {
    final identity = _currentSessionIdentity();
    final postId = widget.postId;
    final saved = await Navigator.of(context).push<PostDetail>(
      MaterialPageRoute(builder: (_) => EditPostScreen(post: post)),
    );
    if (saved == null ||
        !mounted ||
        identity != _currentSessionIdentity() ||
        postId != widget.postId ||
        saved.id != postId) {
      return;
    }
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

  /// A new URL for the post's voice memo, or null when it can't be read now.
  Future<Uri?> _freshVoiceMemoUrl(String postId) async {
    final result = await AppScope.of(context).posts.voiceMemo(postId);
    return switch (result) {
      ApiSuccess(value: final memo) => memo.url,
      ApiError() => null,
    };
  }

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
    final signedIn = _session?.status == SessionStatus.signedIn;
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
              if (post.voiceMemo?.url case final url?) ...[
                const SizedBox(height: 16),
                // Starts only when played. A URL that has expired is replaced
                // once, by asking the server again.
                VoicePlayerPill.network(
                  key: ValueKey('post.voiceMemo.${post.id}'),
                  url: url,
                  label: post.viewerIsAuthor
                      ? 'Your voice memo'
                      : "${post.displayName}'s voice memo",
                  onRefreshUrl: () => _freshVoiceMemoUrl(post.id),
                ),
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
              if (signedIn) ...[
                const SizedBox(height: 12),
                Row(
                  children: [
                    IconButton(
                      key: const Key('post.like'),
                      tooltip: post.viewerHasLiked ? 'Unlike' : 'Like',
                      isSelected: post.viewerHasLiked,
                      onPressed: _liking || stale
                          ? null
                          : () => _toggleLike(post),
                      icon: Icon(
                        post.viewerHasLiked
                            ? Icons.favorite_rounded
                            : Icons.favorite_border_rounded,
                        color: colors.foregroundAccent,
                      ),
                    ),
                    TextButton(
                      key: const Key('post.likes'),
                      style: TextButton.styleFrom(
                        foregroundColor: colors.foregroundSecondary,
                      ),
                      onPressed: post.likeCount == 0
                          ? null
                          : () => Navigator.of(context).push<void>(
                              MaterialPageRoute(
                                builder: (_) =>
                                    PostLikersScreen(postId: post.id),
                              ),
                            ),
                      child: Text(
                        post.likeCount == 1
                            ? '1 like'
                            : '${post.likeCount} likes',
                      ),
                    ),
                    const Spacer(),
                    Text(
                      post.commentCount == 1
                          ? '1 comment'
                          : '${post.commentCount} comments',
                      key: const Key('post.commentCount'),
                      style: muted,
                    ),
                  ],
                ),
              ] else ...[
                const SizedBox(height: 20),
                Row(
                  children: [
                    Expanded(
                      child: DayliButton(
                        key: const Key('post.like'),
                        label: 'like',
                        color: ButtonColor.background,
                        onPressed: () => _interaction(PublicActionIntent.like),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: DayliButton(
                        key: const Key('post.comment'),
                        label: 'comment',
                        color: ButtonColor.background,
                        onPressed: () =>
                            _interaction(PublicActionIntent.comment),
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 16),
        if (signedIn)
          PostComments(
            key: ValueKey('comments.$_loads'),
            postId: post.id,
            onChanged: _refreshCounts,
            focusComposer: _consumedIntent == PublicActionIntent.comment,
          ),
      ],
    );
  }

  /// Signed-out visitors are sent to sign in and come back to this post. A
  /// returned intent is never replayed: a comment intent puts the cursor in
  /// the comment box, and a like intent just lands on the post.
  void _interaction(PublicActionIntent action) {
    final intent = _session?.issuePublicReturnIntent(
      '/posts/${widget.postId}',
      action,
    );
    context.go(intent?.authLocation() ?? '/sign-in');
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

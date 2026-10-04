import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/api_failure.dart';
import '../api/interactions_client.dart';
import '../app/app_scope.dart';
import '../app/theme.dart';
import '../compose/composer_controller.dart' show generateIdempotencyKey;
import '../ui/dayli_button.dart';

/// The API counts Unicode code points, so this counts runes, not graphemes.
const commentMaxLength = 1000;

bool _tooLong(String text) => text.runes.length > commentMaxLength;

/// The order the API lists comments in.
int _writtenOrder(PostComment a, PostComment b) {
  final byTime = a.createdAt.compareTo(b.createdAt);
  return byTime != 0 ? byTime : a.id.compareTo(b.id);
}

/// Comments with one level of replies, oldest first, and a box to add one.
/// A comment that fails to post keeps its text and its client ID, so trying
/// again never posts it twice. [onChanged] runs after a comment is added or
/// deleted, so the post can read its count from the server.
class PostComments extends StatefulWidget {
  const PostComments({
    super.key,
    required this.postId,
    required this.onChanged,
    this.focusComposer = false,
  });

  final String postId;
  final VoidCallback onChanged;

  /// Puts the cursor in the comment box once, as the screen opens. A visitor
  /// who tapped "comment" while signed out lands here after signing in.
  final bool focusComposer;

  @override
  State<PostComments> createState() => _PostCommentsState();
}

class _PostCommentsState extends State<PostComments> {
  final _input = TextEditingController();
  final _focus = FocusNode();
  final _comments = <PostComment>[];

  /// Comments posted here. A new comment belongs after every older one, so
  /// while older pages are unloaded it is kept here until paging reaches it.
  final _created = <PostComment>[];
  String? _nextCursor;
  bool _loading = true;
  bool _loadingMore = false;
  ApiFailure? _loadFailure;

  PostComment? _replyingTo;
  String _clientCommentId = generateIdempotencyKey();
  bool _sending = false;
  ApiFailure? _sendFailure;

  /// The last comment posted went after pages that haven't loaded yet.
  bool _postedOutOfView = false;

  @override
  void initState() {
    super.initState();
    if (widget.focusComposer) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _focus.requestFocus();
      });
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_loading && _comments.isEmpty && _loadFailure == null) _load();
  }

  @override
  void dispose() {
    _input.dispose();
    _focus.dispose();
    super.dispose();
  }

  InteractionsClient get _client => AppScope.of(context).interactions;

  Future<void> _load({String? cursor}) async {
    final result = await _client.comments(widget.postId, cursor: cursor);
    if (!mounted) return;
    setState(() {
      _loading = false;
      _loadingMore = false;
      switch (result) {
        case ApiSuccess(:final value):
          if (cursor == null) _comments.clear();
          _comments.addAll(
            value.items.where((item) => !_comments.any((c) => c.id == item.id)),
          );
          _nextCursor = value.hasMore ? value.nextCursor : null;
          _loadFailure = null;
        case ApiError(:final failure):
          _loadFailure = failure;
          if (failure is NotFound) _comments.clear();
      }
    });
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty || _tooLong(text)) return;
    setState(() {
      _sending = true;
      _sendFailure = null;
    });
    final result = await _client.createComment(
      widget.postId,
      clientCommentId: _clientCommentId,
      text: text,
      parentCommentId: _replyingTo?.id,
    );
    if (!mounted) return;
    setState(() {
      _sending = false;
      switch (result) {
        case ApiSuccess(:final value):
          // A reply shows under its comment. A new comment shows at the end,
          // after any pages that haven't loaded yet.
          _postedOutOfView = _nextCursor != null && _replyingTo == null;
          if (!_comments.any((c) => c.id == value.id) &&
              !_created.any((c) => c.id == value.id)) {
            _created.add(value);
          }
          _input.clear();
          _replyingTo = null;
          _clientCommentId = generateIdempotencyKey();
        case ApiError(:final failure):
          _sendFailure = failure;
      }
    });
    if (result is ApiSuccess) widget.onChanged();
  }

  /// Changing the text after a failure makes it a new comment with a new ID.
  void _onTyped(String _) {
    if (_sendFailure != null) {
      setState(() {
        _sendFailure = null;
        _clientCommentId = generateIdempotencyKey();
      });
    } else {
      setState(() {});
    }
  }

  void _reply(PostComment? comment) {
    setState(() {
      // A failed send may have reached the server under its old ID with the
      // old reply target, so a different target is a new comment.
      if (comment?.id != _replyingTo?.id && _sendFailure != null) {
        _sendFailure = null;
        _clientCommentId = generateIdempotencyKey();
      }
      _replyingTo = comment;
      _postedOutOfView = false;
    });
    if (comment != null) _focus.requestFocus();
  }

  Future<void> _edit(PostComment comment) async {
    final text = await showDialog<String>(
      context: context,
      builder: (context) => _EditCommentDialog(initialText: comment.text),
    );
    if (!mounted ||
        text == null ||
        text.isEmpty ||
        text == comment.text ||
        _tooLong(text)) {
      return;
    }
    final result = await _client.updateComment(widget.postId, comment.id, text);
    if (!mounted) return;
    switch (result) {
      case ApiSuccess(:final value):
        setState(() {
          for (final list in [_comments, _created]) {
            final index = list.indexWhere((c) => c.id == value.id);
            if (index >= 0) list[index] = value;
          }
        });
      case ApiError(:final failure):
        _notify(_failureText(failure, "Your edit couldn't be saved."));
    }
  }

  Future<void> _delete(PostComment comment) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        key: const Key('comment.deleteDialog'),
        title: Text(
          comment.parentCommentId == null
              ? 'Delete this comment and its replies?'
              : 'Delete this reply?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            key: const Key('comment.deleteDialog.confirm'),
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
    final result = await _client.deleteComment(widget.postId, comment.id);
    if (!mounted) return;
    switch (result) {
      // Already gone counts as deleted. A 404 can also mean the post itself
      // is gone, which the post finds out when it reads its counts again.
      case ApiSuccess() || ApiError(failure: NotFound()):
        setState(() {
          for (final list in [_comments, _created]) {
            list.removeWhere(
              (c) => c.id == comment.id || c.parentCommentId == comment.id,
            );
          }
        });
        if (_replyingTo?.id == comment.id) _reply(null);
        // Replies on unloaded pages go too, so only the server knows the count.
        widget.onChanged();
      case ApiError(:final failure):
        _notify(_failureText(failure, "That comment couldn't be deleted."));
    }
  }

  void _notify(String text) => ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(key: const Key('comments.notice'), content: Text(text)),
  );

  static String _failureText(ApiFailure failure, String fallback) =>
      switch (failure) {
        NetworkUnavailable() =>
          "You're offline. Your comment is still here; send it again when "
              "you're back online.",
        NotFound() => "This dayli isn't available any more.",
        RateLimited() => 'Too many comments at once. Wait a moment.',
        InvalidRequest() =>
          "That comment can't be posted. Check it and try again.",
        _ => fallback,
      };

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final muted = DayliText.sans(
      context,
      size: DayliTextSize.sm,
      color: colors.foregroundSecondary,
    );
    final loadedIds = {for (final c in _comments) c.id};
    final created = _created.where((c) => !loadedIds.contains(c.id)).toList();
    final all = [..._comments, ...created];
    List<Widget> thread(PostComment comment) => [
      _CommentTile(
        comment: comment,
        onReply: () => _reply(comment),
        onEdit: () => _edit(comment),
        onDelete: () => _delete(comment),
      ),
      for (final reply
          in all.where((c) => c.parentCommentId == comment.id).toList()
            ..sort(_writtenOrder))
        Padding(
          padding: const EdgeInsets.only(left: 28),
          child: _CommentTile(
            comment: reply,
            onEdit: () => _edit(reply),
            onDelete: () => _delete(reply),
          ),
        ),
    ];

    return Column(
      key: const Key('comments'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_loading)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
          )
        else if (_loadFailure != null && _comments.isEmpty) ...[
          Text(
            _loadFailure is NotFound
                ? "Comments aren't available."
                : "Comments couldn't be loaded.",
            key: const Key('comments.loadError'),
            style: muted,
          ),
          if (_loadFailure is! NotFound) ...[
            const SizedBox(height: 8),
            DayliButton(
              key: const Key('comments.retryLoad'),
              label: 'Try again',
              color: ButtonColor.foreground,
              height: 40,
              onPressed: () {
                setState(() => _loading = true);
                _load();
              },
            ),
          ],
        ] else
          for (final comment in _comments.where(
            (c) => c.parentCommentId == null,
          ))
            ...thread(comment),
        if (_nextCursor case final cursor?)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              key: const Key('comments.more'),
              onPressed: _loadingMore
                  ? null
                  : () {
                      setState(() => _loadingMore = true);
                      _load(cursor: cursor);
                    },
              child: Text(_loadingMore ? 'Loading...' : 'Show more comments'),
            ),
          ),
        for (final comment in created.where((c) => c.parentCommentId == null))
          ...thread(comment),
        const SizedBox(height: 12),
        if (_replyingTo case final parent?)
          Row(
            children: [
              Expanded(
                child: Text(
                  'Replying to ${parent.author.displayName}',
                  key: const Key('comments.replyingTo'),
                  style: muted,
                ),
              ),
              IconButton(
                key: const Key('comments.cancelReply'),
                tooltip: 'Cancel reply',
                icon: const Icon(Icons.close_rounded, size: 18),
                onPressed: () => _reply(null),
              ),
            ],
          ),
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: TextField(
                key: const Key('comments.input'),
                controller: _input,
                focusNode: _focus,
                minLines: 1,
                maxLines: 4,
                textCapitalization: TextCapitalization.sentences,
                onChanged: _onTyped,
                decoration: InputDecoration(
                  hintText: _replyingTo == null
                      ? 'Add a comment'
                      : 'Add a reply',
                  errorText: _tooLong(_input.text.trim())
                      ? 'Keep it to $commentMaxLength characters.'
                      : null,
                ),
              ),
            ),
            IconButton(
              key: const Key('comments.send'),
              tooltip: _sendFailure != null ? 'Send again' : 'Send',
              onPressed:
                  _sending ||
                      _input.text.trim().isEmpty ||
                      _tooLong(_input.text.trim())
                  ? null
                  : _send,
              icon: _sending
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Icon(Icons.send_rounded, color: colors.foregroundAccent),
            ),
          ],
        ),
        if (_postedOutOfView && _sendFailure == null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(
              "Posted. It's at the end, after the comments that haven't "
              'loaded yet.',
              key: const Key('comments.postedOutOfView'),
              style: muted,
            ),
          ),
        if (_sendFailure case final failure?)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Semantics(
              liveRegion: true,
              child: Text(
                _failureText(
                  failure,
                  "That comment couldn't be posted. Try again.",
                ),
                key: const Key('comments.sendError'),
                style: DayliText.sans(
                  context,
                  size: DayliTextSize.sm,
                  color: colors.danger,
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _CommentTile extends StatelessWidget {
  const _CommentTile({
    required this.comment,
    required this.onEdit,
    required this.onDelete,
    this.onReply,
  });

  final PostComment comment;
  final VoidCallback? onReply;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final muted = DayliText.sans(
      context,
      size: DayliTextSize.sm,
      color: colors.foregroundSecondary,
    );
    final canChange = comment.viewerCanEdit || comment.viewerCanDelete;
    return Padding(
      key: Key('comment.${comment.id}'),
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                GestureDetector(
                  onTap: () => context.go(
                    '/u/${Uri.encodeComponent(comment.author.username)}',
                  ),
                  child: Text(
                    [
                      comment.author.displayName,
                      MaterialLocalizations.of(
                        context,
                      ).formatShortMonthDay(comment.createdAt.toLocal()),
                      if (comment.editedAt != null) 'edited',
                    ].join(' · '),
                    style: muted,
                  ),
                ),
                const SizedBox(height: 2),
                Text(comment.text, style: DayliText.sans(context)),
                if (onReply != null)
                  TextButton(
                    key: Key('comment.${comment.id}.reply'),
                    style: TextButton.styleFrom(
                      padding: EdgeInsets.zero,
                      minimumSize: const Size(0, 36),
                      foregroundColor: colors.foregroundSecondary,
                    ),
                    onPressed: onReply,
                    child: const Text('Reply'),
                  ),
              ],
            ),
          ),
          if (canChange)
            PopupMenuButton<String>(
              key: Key('comment.${comment.id}.menu'),
              tooltip: 'Comment options',
              onSelected: (action) => action == 'edit' ? onEdit() : onDelete(),
              itemBuilder: (context) => [
                if (comment.viewerCanEdit)
                  const PopupMenuItem(
                    key: Key('comment.edit'),
                    value: 'edit',
                    child: Text('Edit'),
                  ),
                if (comment.viewerCanDelete)
                  const PopupMenuItem(
                    key: Key('comment.delete'),
                    value: 'delete',
                    child: Text('Delete'),
                  ),
              ],
            ),
        ],
      ),
    );
  }
}

/// Owns its text controller, so it is disposed only after the dialog closes.
class _EditCommentDialog extends StatefulWidget {
  const _EditCommentDialog({required this.initialText});

  final String initialText;

  @override
  State<_EditCommentDialog> createState() => _EditCommentDialogState();
}

class _EditCommentDialogState extends State<_EditCommentDialog> {
  late final _controller = TextEditingController(text: widget.initialText);

  String get _text => _controller.text.trim();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    key: const Key('comment.editDialog'),
    title: const Text('Edit comment'),
    content: TextField(
      key: const Key('comment.edit.input'),
      controller: _controller,
      autofocus: true,
      minLines: 1,
      maxLines: 5,
      onChanged: (_) => setState(() {}),
      decoration: InputDecoration(
        errorText: _tooLong(_text)
            ? 'Keep it to $commentMaxLength characters.'
            : null,
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.of(context).pop(),
        child: const Text('Cancel'),
      ),
      TextButton(
        key: const Key('comment.edit.save'),
        onPressed: _text.isEmpty || _tooLong(_text)
            ? null
            : () => Navigator.of(context).pop(_text),
        child: const Text('Save'),
      ),
    ],
  );
}

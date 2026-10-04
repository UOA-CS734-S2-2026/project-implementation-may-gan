import 'package:flutter/material.dart';

import '../api/api_failure.dart';
import '../api/post_client.dart';
import '../app/app_scope.dart';
import '../app/theme.dart';
import '../ui/dayli_button.dart';
import '../ui/surfaces.dart';

/// Earlier versions of a post, newest first, as this user may see them. The
/// list is read from the server on every open and never cached, so access
/// that was revoked shows the unavailable state instead.
class PostRevisionsScreen extends StatefulWidget {
  const PostRevisionsScreen({
    super.key,
    required this.postId,
    required this.viewerIsAuthor,
  });

  final String postId;
  final bool viewerIsAuthor;

  @override
  State<PostRevisionsScreen> createState() => _PostRevisionsScreenState();
}

class _PostRevisionsScreenState extends State<PostRevisionsScreen> {
  final _revisions = <PostRevision>[];
  String? _nextCursor;
  bool _loading = true;
  bool _loadingMore = false;
  ApiFailure? _failure;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_loading && _revisions.isEmpty && _failure == null) _load();
  }

  Future<void> _load({String? cursor}) async {
    final services = AppScope.of(context);
    final result = await services.posts.revisions(
      widget.postId,
      cursor: cursor,
    );
    if (!mounted) return;
    if (result case ApiError(failure: Unauthenticated())) {
      await services.session.sessionExpired();
      return;
    }
    setState(() {
      _loading = false;
      _loadingMore = false;
      switch (result) {
        case ApiSuccess(:final value):
          if (cursor == null) _revisions.clear();
          _revisions.addAll(value.items);
          _nextCursor = value.hasMore ? value.nextCursor : null;
          _failure = null;
        case ApiError(:final failure):
          _failure = failure;
          // Access may have ended; never keep history the server now refuses.
          if (failure is NotFound) _revisions.clear();
      }
    });
  }

  Future<void> _retry() async {
    setState(() {
      _loading = true;
      _failure = null;
    });
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
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
                  'earlier versions',
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
    );
  }

  Widget _body(BuildContext context) {
    final colors = DayliColors.of(context);
    final muted = DayliText.sans(
      context,
      size: DayliTextSize.sm,
      color: colors.foregroundSecondary,
    );
    if (_loading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 80),
        child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
      );
    }
    final failure = _failure;
    if (_revisions.isEmpty) {
      if (failure is NotFound) {
        return Text(
          "Earlier versions aren't available. The dayli may have been deleted, "
          'or you may no longer have access.',
          key: const Key('revisions.unavailable'),
          style: muted,
        );
      }
      if (failure != null) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              failure is NetworkUnavailable
                  ? "You're offline, so earlier versions couldn't load."
                  : "Earlier versions couldn't be loaded.",
              key: const Key('revisions.error'),
              style: muted,
            ),
            const SizedBox(height: 16),
            DayliButton(
              key: const Key('revisions.retry'),
              label: 'Try again',
              color: ButtonColor.foreground,
              height: 44,
              onPressed: _retry,
            ),
          ],
        );
      }
      return Text(
        'No earlier versions.',
        key: const Key('revisions.empty'),
        style: muted,
      );
    }

    final localizations = MaterialLocalizations.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final revision in _revisions) ...[
          DayliCard(
            key: Key('revisions.${revision.revisionNumber}'),
            padding: const EdgeInsets.all(16),
            radius: 16,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  [
                    'Version ${revision.revisionNumber}',
                    'replaced ${localizations.formatMediumDate(revision.replacedAt.toLocal())}',
                    '${revision.rating}/10',
                    if (widget.viewerIsAuthor)
                      revision.audience == 'solo' ? 'Only you' : 'Friends',
                  ].join(' · '),
                  style: muted,
                ),
                const SizedBox(height: 8),
                Text(
                  revision.reflectiveAnswer,
                  style: DayliText.serif(
                    context,
                    size: DayliTextSize.lg,
                    weight: FontWeight.w500,
                    tracking: DayliTracking.tight,
                  ),
                ),
                if (revision.caption case final caption?) ...[
                  const SizedBox(height: 8),
                  Text(caption, style: DayliText.sans(context)),
                ],
              ],
            ),
          ),
          const SizedBox(height: 12),
        ],
        if (_nextCursor case final cursor?)
          DayliButton(
            key: const Key('revisions.more'),
            label: _loadingMore ? 'Loading...' : 'Show older versions',
            color: ButtonColor.foreground,
            height: 44,
            onPressed: _loadingMore
                ? null
                : () {
                    setState(() => _loadingMore = true);
                    _load(cursor: cursor);
                  },
          ),
        if (failure != null && failure is! NotFound) ...[
          const SizedBox(height: 8),
          Text(
            "Older versions couldn't be loaded. Try again.",
            key: const Key('revisions.moreError'),
            style: muted,
          ),
        ],
      ],
    );
  }
}

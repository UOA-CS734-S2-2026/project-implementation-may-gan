import 'package:flutter/material.dart';

import '../api/api_failure.dart';
import '../api/post_client.dart';
import '../app/app_scope.dart';
import '../app/theme.dart';
import '../compose/composer_controller.dart' show DailyPostLimits;
import '../auth/session_controller.dart';
import '../drafts/daily_post_draft.dart' show PostAudience;
import '../ui/dayli_button.dart';
import '../ui/form_input.dart';
import '../ui/post_inputs.dart';

/// Lets the author change the answer, rating, word dump, and audience of a
/// post. Nothing typed is thrown away without asking: a failed, offline, or
/// conflicting save keeps every change on screen. Pops with the saved post.
class EditPostScreen extends StatefulWidget {
  const EditPostScreen({super.key, required this.post});

  final PostDetail post;

  @override
  State<EditPostScreen> createState() => _EditPostScreenState();
}

class _EditPostScreenState extends State<EditPostScreen> {
  late final _answer = TextEditingController(
    text: widget.post.reflectiveAnswer,
  );
  late final _caption = TextEditingController(text: widget.post.caption ?? '');
  late int _rating = widget.post.rating;
  late PostAudience _audience = widget.post.audience == 'solo'
      ? PostAudience.solo
      : PostAudience.friends;

  /// The version these changes are based on. Loading the latest version after
  /// a conflict moves it forward without touching the fields.
  late PostDetail _base = widget.post;
  bool _saving = false;
  bool _reloading = false;
  ApiFailure? _failure;

  /// Why the latest version couldn't be read after a conflict. The conflict
  /// itself stays in [_failure] until a newer version loads.
  ApiFailure? _reloadFailure;
  String? _notice;
  SessionController? _session;
  ModalRoute<dynamic>? _overlayRoute;
  (SessionStatus, String?, int)? _openingIdentity;
  int _operationGeneration = 0;
  bool _dismissed = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _overlayRoute ??= ModalRoute.of(context);
    final session = AppScope.of(context).session;
    if (_session != session) {
      _session?.removeListener(_onSessionChanged);
      _session = session..addListener(_onSessionChanged);
      _openingIdentity ??= _currentIdentity();
    }
    _onSessionChanged();
  }

  (SessionStatus, String?, int) _currentIdentity() {
    final session = _session!;
    return (session.status, session.user?.id, session.generation);
  }

  bool _isCurrentOperation(
    int operationGeneration,
    (SessionStatus, String?, int) identity,
  ) =>
      mounted &&
      !_dismissed &&
      operationGeneration == _operationGeneration &&
      identity == _openingIdentity &&
      identity == _currentIdentity();

  void _onSessionChanged() {
    if (!mounted || _dismissed || _openingIdentity == _currentIdentity()) {
      return;
    }
    _dismissed = true;
    _operationGeneration++;
    _answer.clear();
    _caption.clear();
    _failure = null;
    _reloadFailure = null;
    _notice = null;
    _closeOverlay();
  }

  void _closeOverlay() {
    final route = _overlayRoute;
    final navigator = Navigator.of(context);
    if (route == null) {
      navigator.pop();
      return;
    }
    navigator.popUntil((candidate) => candidate == route);
    if (route.isCurrent) navigator.pop();
  }

  @override
  void dispose() {
    _session?.removeListener(_onSessionChanged);
    _operationGeneration++;
    _answer.dispose();
    _caption.dispose();
    super.dispose();
  }

  String get _answerText => _answer.text.trim();
  String get _captionText => _caption.text.trim();

  bool get _changed =>
      _answerText != _base.reflectiveAnswer ||
      (_captionText.isEmpty ? null : _captionText) != _base.caption ||
      _rating != _base.rating ||
      _audience.wireValue != _base.audience;

  String? get _answerError {
    if (_answerText.isEmpty) return 'Please respond to the daily prompt.';
    if (_answerText.characters.length > DailyPostLimits.reflectiveAnswerMax) {
      return 'Keep it to ${DailyPostLimits.reflectiveAnswerMax} characters.';
    }
    return null;
  }

  String? get _captionError =>
      _captionText.characters.length > DailyPostLimits.captionMax
      ? 'Keep it to ${DailyPostLimits.captionMax} characters.'
      : null;

  Future<void> _save() async {
    final identity = _currentIdentity();
    final operationGeneration = ++_operationGeneration;
    setState(() {
      _saving = true;
      _failure = null;
      _notice = null;
    });
    final services = AppScope.of(context);
    final result = await services.posts.update(
      _base.id,
      PostEdit(
        expectedRevisionCount: _base.revisionCount,
        reflectiveAnswer: _answerText,
        caption: _captionText.isEmpty ? null : _captionText,
        rating: _rating,
        audience: _audience.wireValue,
      ),
    );
    if (!mounted || !_isCurrentOperation(operationGeneration, identity)) {
      return;
    }
    switch (result) {
      case ApiSuccess(:final value):
        Navigator.of(context).pop(value);
      case ApiError(failure: Unauthenticated()):
        await services.session.sessionExpired();
      case ApiError(:final failure):
        setState(() {
          _saving = false;
          _failure = failure;
        });
    }
  }

  /// Reads the post again after a conflict, keeping what the author typed.
  Future<void> _reloadLatest() async {
    final identity = _currentIdentity();
    final operationGeneration = ++_operationGeneration;
    setState(() => _reloading = true);
    final result = await AppScope.of(context).posts.get(_base.id);
    if (!_isCurrentOperation(operationGeneration, identity)) return;
    setState(() {
      _reloading = false;
      switch (result) {
        case ApiSuccess(:final value):
          _base = value;
          _failure = null;
          _reloadFailure = null;
          _notice =
              'Loaded the latest version. Your changes are still here; '
              'check them and save again.';
        case ApiError(:final failure):
          // Saving against the stale version would only conflict again.
          _reloadFailure = failure;
      }
    });
  }

  Future<void> _leave() async {
    if (!_changed || _saving) {
      if (!_saving) Navigator.of(context).pop();
      return;
    }
    final discard = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        key: const Key('editPost.discard'),
        title: const Text('Discard your changes?'),
        content: const Text('Your edits to this dayli will be lost.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Keep editing'),
          ),
          TextButton(
            key: const Key('editPost.discard.confirm'),
            onPressed: () => Navigator.of(context).pop(true),
            style: TextButton.styleFrom(
              foregroundColor: DayliColors.of(context).danger,
            ),
            child: const Text('Discard'),
          ),
        ],
      ),
    );
    if (discard == true && mounted) Navigator.of(context).pop();
  }

  static String _failureText(ApiFailure failure) => switch (failure) {
    Conflict() =>
      'This dayli was edited somewhere else since you opened it. Load the '
          'latest version, check your changes, and save again.',
    NotFound() =>
      "This dayli isn't available any more. It may have been deleted.",
    NetworkUnavailable() =>
      "You're offline. Your changes are still here; save again when you're "
          'back online.',
    InvalidRequest() => 'Some details need another look.',
    RateLimited() => 'Too many changes at once. Wait a moment and try again.',
    _ => "Your changes couldn't be saved. Try again.",
  };

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final muted = DayliText.sans(
      context,
      size: DayliTextSize.sm,
      color: colors.foregroundSecondary,
    );
    final failure = _failure;
    final valid = _answerError == null && _captionError == null;

    return PopScope(
      canPop: !_changed && !_saving,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _leave();
      },
      child: Scaffold(
        backgroundColor: colors.background,
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(4, 4, 4, 32),
            children: [
              Row(
                children: [
                  IconButton(
                    key: const Key('editPost.back'),
                    tooltip: 'Back',
                    onPressed: _leave,
                    icon: const Icon(Icons.arrow_back_rounded),
                  ),
                  Text(
                    'edit dayli',
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
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      'Day rating · $_rating/10',
                      style: DayliText.sans(
                        context,
                        size: DayliTextSize.sm,
                        weight: FontWeight.w500,
                      ),
                    ),
                    RatingSlider(
                      keyPrefix: 'editPost',
                      value: _rating,
                      onChanged: (rating) => setState(() => _rating = rating),
                    ),
                    const SizedBox(height: 16),
                    DayliFormInput(
                      label: _base.promptText,
                      fieldKey: const Key('editPost.answer'),
                      controller: _answer,
                      minLines: 3,
                      maxLines: 8,
                      error: _answerError,
                      textCapitalization: TextCapitalization.sentences,
                      onChanged: (_) => setState(() {}),
                    ),
                    const SizedBox(height: 16),
                    DayliFormInput(
                      label: 'Word dump',
                      fieldKey: const Key('editPost.caption'),
                      controller: _caption,
                      minLines: 2,
                      maxLines: 6,
                      helper: 'Leave blank to remove it.',
                      error: _captionError,
                      textCapitalization: TextCapitalization.sentences,
                      onChanged: (_) => setState(() {}),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Who can see this',
                      style: DayliText.sans(
                        context,
                        size: DayliTextSize.sm,
                        weight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 8),
                    AudiencePicker(
                      keyPrefix: 'editPost',
                      value: _audience,
                      invalid: false,
                      onChanged: (audience) =>
                          setState(() => _audience = audience),
                    ),
                    const SizedBox(height: 16),
                    if (_notice case final notice?) ...[
                      Text(
                        notice,
                        key: const Key('editPost.notice'),
                        style: muted,
                      ),
                      const SizedBox(height: 8),
                    ],
                    if (failure != null) ...[
                      Semantics(
                        liveRegion: true,
                        child: Text(
                          _failureText(failure),
                          key: const Key('editPost.error'),
                          style: DayliText.sans(
                            context,
                            size: DayliTextSize.sm,
                            color: colors.danger,
                          ),
                        ),
                      ),
                      const SizedBox(height: 8),
                      if (failure is Conflict) ...[
                        DayliButton(
                          key: const Key('editPost.reload'),
                          label: _reloading
                              ? 'Loading...'
                              : 'Load the latest version',
                          color: ButtonColor.foreground,
                          fullWidth: true,
                          height: 44,
                          onPressed: _reloading ? null : _reloadLatest,
                        ),
                        const SizedBox(height: 8),
                        if (_reloadFailure case final reloadFailure?) ...[
                          Text(
                            reloadFailure is NetworkUnavailable
                                ? "You're offline, so the latest version "
                                      "couldn't be loaded. Try again when "
                                      "you're back online."
                                : "The latest version couldn't be loaded. "
                                      'Try again.',
                            key: const Key('editPost.reloadError'),
                            style: muted,
                          ),
                          const SizedBox(height: 8),
                        ],
                      ],
                    ],
                    DayliButton(
                      key: const Key('editPost.save'),
                      label: _saving ? 'Saving...' : 'Save changes',
                      fullWidth: true,
                      height: 48,
                      onPressed:
                          _saving || !valid || !_changed || failure is Conflict
                          ? null
                          : _save,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

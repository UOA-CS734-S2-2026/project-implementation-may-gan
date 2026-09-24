import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../app/app_scope.dart';
import '../app/theme.dart';
import '../drafts/daily_post_draft.dart';
import 'composer_controller.dart';
import 'deadline_countdown.dart';

/// The daily post composer, adapted from the web app's "Post your Dayli!"
/// form. Every edit is saved to protected storage as the author types.
class ComposerScreen extends StatefulWidget {
  const ComposerScreen({super.key});

  @override
  State<ComposerScreen> createState() => _ComposerScreenState();
}

class _ComposerScreenState extends State<ComposerScreen> {
  ComposerController? _controller;
  final _answer = TextEditingController();
  final _caption = TextEditingController();
  final _note = TextEditingController();
  String? _boundDraftKey;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_controller != null) return;
    final services = AppScope.of(context);
    final userId = services.session.user?.id;
    if (userId == null) return;
    _controller = ComposerController(
      userId: userId,
      postingDays: services.postingDays,
      drafts: services.drafts,
      submitter: services.submitter,
      clock: services.clock,
      onUnauthenticated: () => services.session.sessionExpired(),
    )..addListener(_syncText);
    _controller!.load();
  }

  /// Copies a newly loaded draft into the text fields once, without fighting
  /// the author's cursor on later rebuilds.
  void _syncText() {
    final draft = _controller?.draft;
    final key = draft == null
        ? null
        : '${draft.localDate}:${draft.idempotencyKey}';
    if (draft == null || key == _boundDraftKey) return;
    _boundDraftKey = key;
    _answer.text = draft.reflectiveAnswer;
    _caption.text = draft.caption;
    _note.text = draft.tomorrowNote;
  }

  @override
  void dispose() {
    _controller?.removeListener(_syncText);
    _controller?.dispose();
    _answer.dispose();
    _caption.dispose();
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    return Scaffold(
      appBar: AppBar(title: const Text('New dayli')),
      body: controller == null
          ? const SizedBox.shrink()
          : ListenableBuilder(
              listenable: controller,
              builder: (context, _) => switch (controller.phase) {
                ComposerPhase.loading => const Center(
                  child: CircularProgressIndicator(),
                ),
                ComposerPhase.editing => _editor(context, controller),
                ComposerPhase.posted => _Posted(message: controller.message),
                ComposerPhase.missedDeadline => _MissedDeadline(
                  draft: controller.draft,
                  message: controller.message,
                  onDiscard: controller.discardMissedDraft,
                ),
                ComposerPhase.unavailable => _Unavailable(
                  message: controller.message,
                  onRetry: controller.load,
                ),
              },
            ),
    );
  }

  Widget _editor(BuildContext context, ComposerController controller) {
    final draft = controller.draft!;
    final day = controller.day;
    final colors = DayliColors.of(context);
    final text = Theme.of(context).textTheme;
    final errors = controller.errors;

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Post your Dayli!', style: text.headlineMedium),
                  const SizedBox(height: 4),
                  Text(
                    'Share how your day was',
                    style: TextStyle(color: colors.foregroundSecondary),
                  ),
                ],
              ),
            ),
            if (day != null)
              DeadlineCountdown(
                deadlineAt: day.deadlineAt,
                serverNow: day.serverNow,
              ),
          ],
        ),
        if (controller.offline) ...[
          const SizedBox(height: 16),
          _Notice(
            text:
                "You're offline. Keep writing; your dayli is saved on this "
                'device and the server decides the deadline when you post.',
          ),
        ],
        if (controller.draftWasDiscarded) ...[
          const SizedBox(height: 16),
          _Notice(
            text:
                "A saved draft couldn't be unlocked on this device and was "
                'removed.',
          ),
        ],
        const SizedBox(height: 20),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                    vertical: 20,
                    horizontal: 16,
                  ),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: colors.backgroundTertiary,
                      width: 2,
                    ),
                  ),
                  child: Text(
                    'Photos and videos are coming soon. For now, share your '
                    'day in words.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: colors.foregroundTertiary),
                  ),
                ),
                const SizedBox(height: 24),
                Text('A bit about your day...', style: text.titleLarge),
                const SizedBox(height: 16),
                _Label('Day rating (1–10)'),
                _RatingPicker(
                  value: draft.rating,
                  onChanged: (rating) =>
                      controller.update(rating: () => rating),
                ),
                if (errors.rating != null) _FieldError(errors.rating!),
                const SizedBox(height: 20),
                _Label(draft.promptText),
                TextField(
                  key: const Key('composer.reflectiveAnswer'),
                  controller: _answer,
                  minLines: 2,
                  maxLines: 6,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: InputDecoration(
                    errorText: errors.reflectiveAnswer,
                  ),
                  onChanged: (value) =>
                      controller.update(reflectiveAnswer: value),
                ),
                const SizedBox(height: 20),
                _Label('Word dump'),
                TextField(
                  key: const Key('composer.caption'),
                  controller: _caption,
                  minLines: 3,
                  maxLines: 8,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: InputDecoration(errorText: errors.caption),
                  onChanged: (value) => controller.update(caption: value),
                ),
                const SizedBox(height: 20),
                _Label('Who can see this?'),
                SegmentedButton<PostAudience>(
                  segments: const [
                    ButtonSegment(
                      value: PostAudience.friends,
                      label: Text('Friends'),
                      icon: Icon(Icons.group_outlined),
                    ),
                    ButtonSegment(
                      value: PostAudience.solo,
                      label: Text('Just me'),
                      icon: Icon(Icons.lock_outline),
                    ),
                  ],
                  selected: {draft.audience},
                  onSelectionChanged: (selection) =>
                      controller.update(audience: selection.first),
                ),
                const SizedBox(height: 4),
                Text(
                  draft.audience == PostAudience.friends
                      ? 'Your friends see it after midnight.'
                      : 'A private journal entry.',
                  style: TextStyle(
                    fontSize: 12,
                    color: colors.foregroundTertiary,
                  ),
                ),
                const SizedBox(height: 20),
                _Label('A note for tomorrow-you'),
                TextField(
                  key: const Key('composer.tomorrowNote'),
                  controller: _note,
                  minLines: 1,
                  maxLines: 4,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: InputDecoration(
                    errorText: errors.tomorrowNote,
                    helperText: 'Only you can read it, from tomorrow.',
                  ),
                  onChanged: (value) => controller.update(tomorrowNote: value),
                ),
                if (controller.message != null) ...[
                  const SizedBox(height: 16),
                  Text(
                    controller.message!,
                    key: const Key('composer.message'),
                    style: TextStyle(color: colors.danger),
                  ),
                ],
                const SizedBox(height: 24),
                Align(
                  alignment: Alignment.centerLeft,
                  child: FilledButton.icon(
                    key: const Key('composer.submit'),
                    onPressed: controller.submitting ? null : controller.submit,
                    icon: controller.submitting
                        ? const SizedBox.square(
                            dimension: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.arrow_forward),
                    label: Text(controller.submitting ? 'Posting...' : 'Post'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _Label extends StatelessWidget {
  const _Label(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Text(text, style: const TextStyle(fontWeight: FontWeight.w500)),
  );
}

class _FieldError extends StatelessWidget {
  const _FieldError(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 6),
    child: Text(
      text,
      style: TextStyle(fontSize: 12, color: DayliColors.of(context).danger),
    ),
  );
}

class _Notice extends StatelessWidget {
  const _Notice({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: colors.backgroundAccent,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(text, style: TextStyle(color: colors.foregroundAccent)),
    );
  }
}

class _RatingPicker extends StatelessWidget {
  const _RatingPicker({required this.value, required this.onChanged});

  final int? value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        for (
          var rating = DailyPostLimits.ratingMin;
          rating <= DailyPostLimits.ratingMax;
          rating++
        )
          ChoiceChip(
            key: Key('composer.rating.$rating'),
            label: Text('$rating'),
            selected: value == rating,
            selectedColor: colors.backgroundAccent,
            labelStyle: TextStyle(
              color: value == rating
                  ? colors.foregroundAccent
                  : colors.foreground,
              fontWeight: FontWeight.w600,
            ),
            showCheckmark: false,
            onSelected: (_) => onChanged(rating),
          ),
      ],
    );
  }
}

class _Posted extends StatelessWidget {
  const _Posted({this.message});

  final String? message;

  @override
  Widget build(BuildContext context) => _CenteredCard(
    title: message ?? "Your dayli is in.",
    body:
        'Friends see friends-only daylies after midnight. Come back tomorrow '
        'for a new prompt.',
    action: FilledButton(
      onPressed: () => context.go('/'),
      child: const Text('Back to today'),
    ),
  );
}

class _MissedDeadline extends StatelessWidget {
  const _MissedDeadline({
    required this.draft,
    required this.message,
    required this.onDiscard,
  });

  final DailyPostDraft? draft;
  final String? message;
  final Future<void> Function() onDiscard;

  @override
  Widget build(BuildContext context) {
    final saved = draft;
    return _CenteredCard(
      title: 'This dayli missed its day',
      body:
          message ??
          "Your dayli for ${saved?.localDate ?? 'an earlier day'} wasn't "
              "posted before midnight, so it can't be posted now. You can "
              'read it here, then start today\'s.',
      extra: saved == null || saved.reflectiveAnswer.trim().isEmpty
          ? null
          : SelectableText(saved.reflectiveAnswer),
      action: FilledButton(
        key: const Key('composer.discardMissed'),
        onPressed: onDiscard,
        child: const Text("Discard it and start today's"),
      ),
    );
  }
}

class _Unavailable extends StatelessWidget {
  const _Unavailable({required this.message, required this.onRetry});

  final String? message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) => _CenteredCard(
    title: "Today's prompt isn't here yet",
    body: message ?? 'Try again shortly.',
    action: FilledButton(onPressed: onRetry, child: const Text('Try again')),
  );
}

class _CenteredCard extends StatelessWidget {
  const _CenteredCard({
    required this.title,
    required this.body,
    required this.action,
    this.extra,
  });

  final String title;
  final String body;
  final Widget action;
  final Widget? extra;

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(20),
    children: [
      Card(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 8),
              Text(
                body,
                style: TextStyle(
                  color: DayliColors.of(context).foregroundSecondary,
                ),
              ),
              if (extra != null) ...[const SizedBox(height: 16), extra!],
              const SizedBox(height: 20),
              action,
            ],
          ),
        ),
      ),
    ],
  );
}

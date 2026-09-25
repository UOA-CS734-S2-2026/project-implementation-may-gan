import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../app/app_scope.dart';
import '../app/theme.dart';
import '../drafts/daily_post_draft.dart';
import '../ui/dayli_button.dart';
import '../ui/form_input.dart';
import '../ui/surfaces.dart';
import 'composer_controller.dart';
import 'deadline_countdown.dart';
import 'media_input.dart';

/// WDCC's "Post your Dayli!" page. The fields appear once media is added, and
/// every edit is saved to protected storage as the author types.
class ComposerScreen extends StatefulWidget {
  const ComposerScreen({super.key});

  @override
  State<ComposerScreen> createState() => _ComposerScreenState();
}

class _ComposerScreenState extends State<ComposerScreen> {
  ComposerController? _controller;
  final _rating = TextEditingController();
  final _answer = TextEditingController();
  final _caption = TextEditingController();
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
    _rating.text = draft.rating?.toString() ?? '';
    _answer.text = draft.reflectiveAnswer;
    _caption.text = draft.caption;
  }

  @override
  void dispose() {
    _controller?.removeListener(_syncText);
    _controller?.dispose();
    _rating.dispose();
    _answer.dispose();
    _caption.dispose();
    super.dispose();
  }

  Future<void> _pick(ComposerController controller, int slot) async {
    final picker = AppScope.of(context).mediaPicker;
    final picked = slot == 0
        ? await picker.pickPhotoOrVideo()
        : await picker.pickPhoto();
    final draft = controller.draft;
    if (picked == null || draft == null) return;
    final attachments = [...draft.attachments];
    if (slot < attachments.length) {
      attachments[slot] = picked;
    } else {
      attachments.add(picked);
    }
    controller.update(attachments: attachments);
  }

  void _remove(ComposerController controller, int slot) {
    final draft = controller.draft;
    if (draft == null) return;
    controller.update(attachments: [...draft.attachments]..removeAt(slot));
  }

  Future<void> _submit(ComposerController controller) async {
    await controller.submit();
    // Like WDCC, a posted dayli returns to the feed.
    if (mounted && controller.phase == ComposerPhase.posted) context.go('/');
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    if (controller == null) return const SizedBox.shrink();
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        final posted = controller.phase == ComposerPhase.posted;
        final day = controller.day;
        final Widget? body = switch (controller.phase) {
          ComposerPhase.loading => null,
          ComposerPhase.editing => _editor(context, controller),
          ComposerPhase.posted => _Message(
            title: 'Come back tomorrow for a new prompt.',
            action: DayliButton(
              label: 'Back to daylies',
              arrow: true,
              onPressed: () => context.go('/'),
            ),
          ),
          ComposerPhase.missedDeadline => _MissedDeadline(
            draft: controller.draft,
            message: controller.message,
            onDiscard: controller.discardMissedDraft,
          ),
          ComposerPhase.unavailable => _Message(
            body: controller.message ?? 'Try again shortly.',
            action: DayliButton(label: 'Try again', onPressed: controller.load),
          ),
        };
        if (body == null) return const SizedBox.shrink();

        return ListView(
          padding: const EdgeInsets.fromLTRB(40, 80, 40, 80),
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(left: 8, right: 16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Post your Dayli!',
                          style: DayliText.serif(
                            context,
                            size: DayliTextSize.xxxxl,
                            weight: FontWeight.w600,
                            tracking: DayliTracking.tighter,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          posted
                              ? "You've posted today's dayli"
                              : 'Share how your day was',
                          style: DayliText.sans(
                            context,
                            size: DayliTextSize.sm,
                            color: DayliColors.of(context).foregroundSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                if (day != null)
                  DeadlineCountdown(
                    deadlineAt: day.deadlineAt,
                    serverNow: day.serverNow,
                  ),
              ],
            ),
            const SizedBox(height: 32),
            body,
          ],
        );
      },
    );
  }

  Widget _editor(BuildContext context, ComposerController controller) {
    final draft = controller.draft!;
    final errors = controller.errors;
    final colors = DayliColors.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (controller.offline)
          const _Notice(
            "You're offline. Keep writing; your dayli is saved on this device "
            'and the server decides the deadline when you post.',
          ),
        if (controller.draftWasDiscarded)
          const _Notice(
            "A saved draft couldn't be unlocked on this device and was removed.",
          ),
        DayliCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              MediaInput(
                attachments: draft.attachments,
                error: errors.media,
                onPick: (slot) => _pick(controller, slot),
                onRemove: (slot) => _remove(controller, slot),
              ),
              if (draft.attachments.isNotEmpty) ...[
                const SizedBox(height: 52),
                Padding(
                  padding: const EdgeInsets.only(top: 20, bottom: 8),
                  child: Text(
                    'A bit about your day...',
                    style: DayliText.serif(
                      context,
                      size: DayliTextSize.xl,
                      weight: FontWeight.w600,
                      tracking: DayliTracking.tighter,
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                DayliFormInput(
                  label: 'Day rating',
                  fieldKey: const Key('composer.rating'),
                  controller: _rating,
                  variant: FormInputVariant.posts,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  error: errors.rating,
                  onChanged: (value) =>
                      controller.update(rating: () => int.tryParse(value)),
                ),
                const SizedBox(height: 20),
                DayliFormInput(
                  label: draft.promptText,
                  fieldKey: const Key('composer.reflectiveAnswer'),
                  controller: _answer,
                  variant: FormInputVariant.posts,
                  textCapitalization: TextCapitalization.sentences,
                  error: errors.reflectiveAnswer,
                  onChanged: (value) =>
                      controller.update(reflectiveAnswer: value),
                ),
                const SizedBox(height: 20),
                DayliFormInput(
                  label: 'Word dump',
                  fieldKey: const Key('composer.caption'),
                  controller: _caption,
                  variant: FormInputVariant.posts,
                  rows: 4,
                  textCapitalization: TextCapitalization.sentences,
                  error: errors.caption,
                  onChanged: (value) => controller.update(caption: value),
                ),
                if (controller.message != null) ...[
                  const SizedBox(height: 20),
                  Text(
                    controller.message!,
                    key: const Key('composer.message'),
                    style: DayliText.sans(
                      context,
                      size: DayliTextSize.sm,
                      color: colors.error,
                    ),
                  ),
                ],
                const SizedBox(height: 36),
                Align(
                  alignment: Alignment.centerLeft,
                  child: DayliButton(
                    key: const Key('composer.submit'),
                    label: controller.submitting ? 'Posting...' : 'Post',
                    arrow: true,
                    onPressed: controller.submitting
                        ? null
                        : () => _submit(controller),
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: colors.backgroundAccent,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        text,
        style: DayliText.sans(
          context,
          size: DayliTextSize.sm,
          color: colors.foregroundAccent,
        ),
      ),
    );
  }
}

/// A card in place of the form, as WDCC's post page shows after posting.
class _Message extends StatelessWidget {
  const _Message({this.title, this.body, this.extra, required this.action});

  final String? title;
  final String? body;
  final Widget? extra;
  final Widget action;

  @override
  Widget build(BuildContext context) => DayliCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (title != null) ...[
          Text(
            title!,
            style: DayliText.serif(
              context,
              size: DayliTextSize.xl,
              weight: FontWeight.w600,
              tracking: DayliTracking.tighter,
            ),
          ),
          const SizedBox(height: 16),
        ],
        if (body != null) ...[
          Text(
            body!,
            style: DayliText.sans(
              context,
              size: DayliTextSize.sm,
              color: DayliColors.of(context).foregroundSecondary,
            ),
          ),
          const SizedBox(height: 16),
        ],
        if (extra != null) ...[extra!, const SizedBox(height: 16)],
        action,
      ],
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
    return _Message(
      title: 'This dayli missed its day',
      body:
          message ??
          "Your dayli for ${saved?.localDate ?? 'an earlier day'} wasn't "
              "posted before midnight, so it can't be posted now. You can "
              "read it here, then start today's.",
      extra: saved == null || saved.reflectiveAnswer.trim().isEmpty
          ? null
          : SelectableText(
              saved.reflectiveAnswer,
              style: DayliText.sans(context, size: DayliTextSize.sm),
            ),
      action: DayliButton(
        key: const Key('composer.discardMissed'),
        label: "Discard it and start today's",
        onPressed: onDiscard,
      ),
    );
  }
}

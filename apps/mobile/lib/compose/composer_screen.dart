import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../app/app_scope.dart';
import '../app/theme.dart';
import '../drafts/daily_post_draft.dart';
import '../ui/dayli_button.dart';
import '../ui/form_input.dart';
import 'composer_controller.dart';
import 'deadline_countdown.dart';
import 'media_input.dart';

/// The daily composer as a full-screen page: today's prompt, media, a 1–10
/// rating, and the words, with the Post button pinned above the keyboard.
/// Every edit is saved to protected storage as the author types.
class ComposerScreen extends StatefulWidget {
  const ComposerScreen({super.key});

  @override
  State<ComposerScreen> createState() => _ComposerScreenState();
}

class _ComposerScreenState extends State<ComposerScreen> {
  ComposerController? _controller;
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
    _answer.text = draft.reflectiveAnswer;
    _caption.text = draft.caption;
  }

  @override
  void dispose() {
    _controller?.removeListener(_syncText);
    _controller?.dispose();
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

  void _close() => context.canPop() ? context.pop() : context.go('/');

  Future<void> _submit(ComposerController controller) async {
    await controller.submit();
    if (mounted && controller.phase == ComposerPhase.posted) _close();
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    final colors = DayliColors.of(context);
    return Scaffold(
      backgroundColor: colors.background,
      body: SafeArea(
        child: controller == null
            ? const SizedBox.shrink()
            : ListenableBuilder(
                listenable: controller,
                builder: (context, _) => Column(
                  children: [
                    _Header(controller: controller, onClose: _close),
                    Expanded(child: _body(context, controller)),
                    if (controller.phase == ComposerPhase.editing)
                      _SubmitBar(
                        submitting: controller.submitting,
                        onSubmit: () => _submit(controller),
                      ),
                  ],
                ),
              ),
      ),
    );
  }

  Widget _body(BuildContext context, ComposerController controller) =>
      switch (controller.phase) {
        ComposerPhase.loading => const Center(
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
        ComposerPhase.editing => _editor(context, controller),
        ComposerPhase.posted => _StateMessage(
          icon: Icons.check_circle_rounded,
          title: "You've posted today's dayli",
          body: 'Come back tomorrow for a new prompt.',
          action: DayliButton(
            label: 'Back to daylies',
            arrow: true,
            fullWidth: true,
            height: 52,
            onPressed: _close,
          ),
        ),
        ComposerPhase.missedDeadline => _MissedDeadline(
          draft: controller.draft,
          message: controller.message,
          onDiscard: controller.discardMissedDraft,
        ),
        ComposerPhase.unavailable => _StateMessage(
          icon: Icons.cloud_off_rounded,
          title: "Today's prompt isn't here yet",
          body: controller.message ?? 'Try again shortly.',
          action: DayliButton(
            label: 'Try again',
            fullWidth: true,
            height: 52,
            onPressed: controller.load,
          ),
        ),
      };

  Widget _editor(BuildContext context, ComposerController controller) {
    final draft = controller.draft!;
    final errors = controller.errors;
    final colors = DayliColors.of(context);

    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
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
        Text(
          "today's prompt",
          style: DayliText.sans(
            context,
            size: DayliTextSize.sm,
            weight: FontWeight.w500,
            color: colors.foregroundTertiary,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          draft.promptText,
          style: DayliText.serif(
            context,
            fontSize: 28,
            weight: FontWeight.w600,
            tracking: DayliTracking.tighter,
          ).copyWith(height: 1.2),
        ),
        const SizedBox(height: 28),
        const _SectionLabel('your day in pictures'),
        MediaInput(
          attachments: draft.attachments,
          error: errors.media,
          onPick: (slot) => _pick(controller, slot),
          onRemove: (slot) => _remove(controller, slot),
        ),
        const SizedBox(height: 28),
        _SectionLabel(
          'rate your day',
          trailing: draft.rating == null ? null : '${draft.rating}/10',
        ),
        _RatingPicker(
          value: draft.rating,
          onChanged: (rating) => controller.update(rating: () => rating),
        ),
        if (errors.rating != null) ...[
          const SizedBox(height: 6),
          Text(
            errors.rating!,
            style: DayliText.sans(
              context,
              size: DayliTextSize.sm,
              color: colors.danger,
            ),
          ),
        ],
        const SizedBox(height: 28),
        DayliFormInput(
          label: 'Your answer',
          fieldKey: const Key('composer.reflectiveAnswer'),
          controller: _answer,
          placeholder: 'Write a few words…',
          minLines: 3,
          maxLines: 8,
          textCapitalization: TextCapitalization.sentences,
          error: errors.reflectiveAnswer,
          onChanged: (value) => controller.update(reflectiveAnswer: value),
        ),
        const SizedBox(height: 20),
        DayliFormInput(
          label: 'Word dump',
          fieldKey: const Key('composer.caption'),
          controller: _caption,
          placeholder: 'Anything else about today (optional)',
          minLines: 3,
          maxLines: 10,
          textCapitalization: TextCapitalization.sentences,
          error: errors.caption,
          onChanged: (value) => controller.update(caption: value),
        ),
        if (controller.message != null) ...[
          const SizedBox(height: 20),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: colors.danger.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              controller.message!,
              key: const Key('composer.message'),
              style: DayliText.sans(
                context,
                size: DayliTextSize.sm,
                color: colors.danger,
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.controller, required this.onClose});

  final ComposerController controller;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final day = controller.day;
    return SizedBox(
      height: 60,
      child: Row(
        children: [
          const SizedBox(width: 4),
          IconButton(
            key: const Key('composer.close'),
            tooltip: 'Close',
            onPressed: onClose,
            icon: const Icon(Icons.close_rounded),
          ),
          Expanded(
            child: Text(
              'new dayli',
              style: DayliText.serif(
                context,
                size: DayliTextSize.xl,
                weight: FontWeight.w600,
                tracking: DayliTracking.tight,
              ),
            ),
          ),
          if (day != null &&
              !day.hasPosted &&
              controller.phase == ComposerPhase.editing)
            DeadlineCountdown(
              deadlineAt: day.deadlineAt,
              serverNow: day.serverNow,
              compact: true,
            ),
          const SizedBox(width: 16),
        ],
      ),
    );
  }
}

class _SubmitBar extends StatelessWidget {
  const _SubmitBar({required this.submitting, required this.onSubmit});

  final bool submitting;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
      decoration: BoxDecoration(
        color: colors.background,
        border: Border(
          top: BorderSide(color: colors.foreground.withValues(alpha: 0.06)),
        ),
      ),
      child: DayliButton(
        key: const Key('composer.submit'),
        label: submitting ? 'Posting…' : 'Post',
        weight: ButtonWeight.primary,
        size: ButtonSize.lg,
        fullWidth: true,
        height: 52,
        arrow: !submitting,
        onPressed: submitting ? null : onSubmit,
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text, {this.trailing});

  final String text;
  final String? trailing;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Expanded(
            child: Text(
              text,
              style: DayliText.serif(
                context,
                size: DayliTextSize.lg,
                weight: FontWeight.w600,
                tracking: DayliTracking.tight,
              ),
            ),
          ),
          if (trailing != null)
            Text(
              trailing!,
              style: DayliText.serif(
                context,
                size: DayliTextSize.lg,
                weight: FontWeight.w600,
                color: colors.foregroundAccent,
              ),
            ),
        ],
      ),
    );
  }
}

/// Ten 48dp targets in two rows, so the rating needs one tap and no keyboard.
class _RatingPicker extends StatelessWidget {
  const _RatingPicker({required this.value, required this.onChanged});

  final int? value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    Widget chip(int rating) {
      final selected = value == rating;
      return Expanded(
        child: Semantics(
          button: true,
          selected: selected,
          label: 'Rate $rating out of 10',
          excludeSemantics: true,
          child: Material(
            color: selected
                ? colors.foregroundAccent
                : colors.backgroundSecondary,
            borderRadius: BorderRadius.circular(12),
            child: InkWell(
              key: Key('composer.rating.$rating'),
              borderRadius: BorderRadius.circular(12),
              onTap: () => onChanged(rating),
              child: SizedBox(
                height: 48,
                child: Center(
                  child: Text(
                    '$rating',
                    style: DayliText.serif(
                      context,
                      size: DayliTextSize.lg,
                      weight: FontWeight.w600,
                      color: selected ? Colors.white : colors.foreground,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    }

    Widget row(int from) => Row(
      children: [
        for (var rating = from; rating < from + 5; rating++) ...[
          if (rating > from) const SizedBox(width: 8),
          chip(rating),
        ],
      ],
    );

    return Column(children: [row(1), const SizedBox(height: 8), row(6)]);
  }
}

class _Notice extends StatelessWidget {
  const _Notice(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    return Container(
      margin: const EdgeInsets.only(bottom: 20),
      padding: const EdgeInsets.all(14),
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

/// A centred status with one clear next step.
class _StateMessage extends StatelessWidget {
  const _StateMessage({
    required this.icon,
    required this.title,
    required this.body,
    required this.action,
    this.extra,
  });

  final IconData icon;
  final String title;
  final String body;
  final Widget action;
  final Widget? extra;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    return ListView(
      padding: const EdgeInsets.fromLTRB(28, 48, 28, 28),
      children: [
        Center(
          child: Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              color: colors.backgroundAccent,
              shape: BoxShape.circle,
            ),
            child: Icon(icon, size: 34, color: colors.foregroundAccent),
          ),
        ),
        const SizedBox(height: 20),
        Text(
          title,
          textAlign: TextAlign.center,
          style: DayliText.serif(
            context,
            fontSize: 26,
            weight: FontWeight.w600,
            tracking: DayliTracking.tighter,
          ).copyWith(height: 1.2),
        ),
        const SizedBox(height: 10),
        Text(
          body,
          textAlign: TextAlign.center,
          style: DayliText.sans(
            context,
            size: DayliTextSize.base,
            color: colors.foregroundSecondary,
          ),
        ),
        if (extra != null) ...[const SizedBox(height: 20), extra!],
        const SizedBox(height: 28),
        action,
      ],
    );
  }
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
    final colors = DayliColors.of(context);
    return _StateMessage(
      icon: Icons.nightlight_round,
      title: 'This dayli missed its day',
      body:
          message ??
          "Your dayli for ${saved?.localDate ?? 'an earlier day'} wasn't "
              "posted before midnight, so it can't be posted now. You can "
              "read it here, then start today's.",
      extra: saved == null || saved.reflectiveAnswer.trim().isEmpty
          ? null
          : Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: colors.card,
                borderRadius: BorderRadius.circular(14),
                boxShadow: DayliShadows.card,
              ),
              child: SelectableText(
                saved.reflectiveAnswer,
                style: DayliText.sans(context, size: DayliTextSize.base),
              ),
            ),
      action: DayliButton(
        key: const Key('composer.discardMissed'),
        label: "Discard it and start today's",
        fullWidth: true,
        height: 52,
        onPressed: onDiscard,
      ),
    );
  }
}

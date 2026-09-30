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
import 'media_upload_controller.dart';

/// The daily composer as a full-screen page: today's prompt, media, a 1–10
/// rating, the words, a note to tomorrow, and who can see it, with the Post
/// button pinned above the keyboard.
/// Every edit is saved to protected storage as the author types.
class ComposerScreen extends StatefulWidget {
  const ComposerScreen({super.key});

  @override
  State<ComposerScreen> createState() => _ComposerScreenState();
}

class _ComposerScreenState extends State<ComposerScreen> {
  ComposerController? _controller;

  /// Null when this build doesn't upload media.
  MediaUploadController? _uploads;
  final _answer = TextEditingController();
  final _caption = TextEditingController();
  final _tomorrowNote = TextEditingController();
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
      requireUploadedMedia: services.mediaUploads != null,
    )..addListener(_syncText);
    final uploads = services.mediaUploads;
    if (uploads != null) {
      _uploads = MediaUploadController(
        composer: _controller!,
        compressor: services.mediaCompressor,
        client: uploads,
        onUnauthenticated: () => services.session.sessionExpired(),
      )..start();
    }
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
    _tomorrowNote.text = draft.tomorrowNote;
  }

  @override
  void dispose() {
    _uploads?.dispose();
    _controller?.removeListener(_syncText);
    _controller?.dispose();
    _answer.dispose();
    _caption.dispose();
    _tomorrowNote.dispose();
    super.dispose();
  }

  Future<void> _pick(ComposerController controller, int slot) async {
    _uploads?.clearNotice();
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

  Widget _media(
    ComposerController controller,
    DailyPostDraft draft,
    String? error,
  ) {
    final uploads = _uploads;
    if (uploads == null) {
      return MediaInput(
        attachments: draft.attachments,
        onPick: (slot) => _pick(controller, slot),
        onRemove: (slot) => _remove(controller, slot),
        error: error,
      );
    }
    return ListenableBuilder(
      listenable: uploads,
      builder: (context, _) => MediaInput(
        attachments: draft.attachments,
        onPick: (slot) => _pick(controller, slot),
        onRemove: (slot) => _remove(controller, slot),
        error: error,
        uploads: true,
        states: [
          for (final attachment in draft.attachments)
            _tileState(uploads, attachment),
        ],
        notice: uploads.notice,
        problem: uploads.problem,
        onRetry: uploads.retryNow,
      ),
    );
  }

  static MediaTileState _tileState(
    MediaUploadController uploads,
    DraftAttachment attachment,
  ) {
    switch (attachment.status) {
      case AttachmentUploadStatus.validated:
        return MediaTileState.done;
      case AttachmentUploadStatus.failed:
        return MediaTileState.failed;
      case AttachmentUploadStatus.pending || AttachmentUploadStatus.uploading:
        if (uploads.active != attachment) return MediaTileState.queued;
        return switch (uploads.activity) {
          UploadActivity.compressing => MediaTileState.compressing,
          UploadActivity.checking => MediaTileState.checking,
          _ => MediaTileState.uploading,
        };
    }
  }

  void _close() => context.canPop() ? context.pop() : context.go('/');

  Future<void> _submit(ComposerController controller) async {
    // Close the keyboard: fields are read-only until the request settles.
    FocusScope.of(context).unfocus();
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

  Widget _body(
    BuildContext context,
    ComposerController controller,
  ) => switch (controller.phase) {
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
    ComposerPhase.missedDeadline => _UnpostedDraft(
      icon: Icons.nightlight_round,
      title: 'This dayli missed its day',
      body:
          controller.message ??
          "Your dayli for ${controller.draft?.localDate ?? 'an earlier day'} "
              "wasn't posted before midnight, so it can't be posted now. "
              "You can read it here, then start today's.",
      draft: controller.draft,
      discardLabel: "Discard it and start today's",
      onDiscard: controller.discardDraft,
    ),
    ComposerPhase.alreadyPosted => _UnpostedDraft(
      icon: Icons.check_circle_rounded,
      title: "Today's dayli is already posted",
      body:
          controller.message ??
          "Today's dayli was already posted, so these words can't be "
              "posted. They're still saved on this device.",
      draft: controller.draft,
      discardLabel: 'Discard these words',
      onDiscard: controller.discardDraft,
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
    // Nothing can change while a post is sending, so the draft always matches
    // what the server receives.
    final locked = controller.submitting;
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
        _Lockable(
          locked: locked,
          child: _media(controller, draft, errors.media),
        ),
        const SizedBox(height: 28),
        _SectionLabel(
          'rate your day',
          trailing: draft.rating == null ? null : '${draft.rating}/10',
        ),
        _Lockable(
          locked: locked,
          child: _RatingSlider(
            value: draft.rating,
            onChanged: (rating) => controller.update(rating: () => rating),
          ),
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
          readOnly: locked,
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
          readOnly: locked,
          controller: _caption,
          placeholder: 'Anything else about today (optional)',
          minLines: 3,
          maxLines: 10,
          textCapitalization: TextCapitalization.sentences,
          error: errors.caption,
          onChanged: (value) => controller.update(caption: value),
        ),
        const SizedBox(height: 20),
        DayliFormInput(
          label: "Note to tomorrow's you",
          fieldKey: const Key('composer.tomorrowNote'),
          readOnly: locked,
          controller: _tomorrowNote,
          placeholder: 'Something to remember tomorrow (optional)',
          helper: 'Only you can read it, from tomorrow.',
          minLines: 2,
          maxLines: 6,
          textCapitalization: TextCapitalization.sentences,
          error: errors.tomorrowNote,
          onChanged: (value) => controller.update(tomorrowNote: value),
        ),
        const SizedBox(height: 28),
        const _SectionLabel('who can see this'),
        _Lockable(
          locked: locked,
          child: _AudiencePicker(
            value: draft.audience,
            invalid: errors.audience != null,
            onChanged: (audience) => controller.update(audience: audience),
          ),
        ),
        if (errors.audience != null) ...[
          const SizedBox(height: 6),
          Text(
            errors.audience!,
            key: const Key('composer.audience.error'),
            style: DayliText.sans(
              context,
              size: DayliTextSize.sm,
              color: colors.danger,
            ),
          ),
        ],
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

/// Blocks taps on a control and dims it while a post is sending.
class _Lockable extends StatelessWidget {
  const _Lockable({required this.locked, required this.child});

  final bool locked;
  final Widget child;

  @override
  Widget build(BuildContext context) => IgnorePointer(
    ignoring: locked,
    child: AnimatedOpacity(
      opacity: locked ? 0.5 : 1,
      duration: const Duration(milliseconds: 150),
      child: child,
    ),
  );
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

/// A 1–10 slider that starts unset, so a rating is always chosen on purpose.
/// The first tap or drag on the track sets it.
class _RatingSlider extends StatelessWidget {
  const _RatingSlider({required this.value, required this.onChanged});

  final int? value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final rated = value != null;
    final ends = DayliText.sans(
      context,
      size: DayliTextSize.sm,
      color: colors.foregroundTertiary,
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SliderTheme(
          data: SliderTheme.of(context).copyWith(
            trackHeight: 6,
            activeTrackColor: rated
                ? colors.foregroundAccent
                : colors.backgroundTertiary,
            inactiveTrackColor: colors.backgroundTertiary,
            thumbColor: rated
                ? colors.foregroundAccent
                : colors.foregroundTertiary,
            overlayColor: colors.foregroundAccent.withValues(alpha: 0.12),
            activeTickMarkColor: Colors.white.withValues(alpha: 0.6),
            inactiveTickMarkColor: colors.foregroundTertiary.withValues(
              alpha: 0.5,
            ),
            thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 12),
            overlayShape: const RoundSliderOverlayShape(overlayRadius: 24),
            showValueIndicator: ShowValueIndicator.never,
          ),
          child: Slider(
            key: const Key('composer.rating'),
            min: DailyPostLimits.ratingMin.toDouble(),
            max: DailyPostLimits.ratingMax.toDouble(),
            divisions: DailyPostLimits.ratingMax - DailyPostLimits.ratingMin,
            value: (value ?? DailyPostLimits.ratingMin).toDouble(),
            semanticFormatterCallback: (rating) =>
                rated ? '${rating.round()} out of 10' : 'Not rated yet',
            onChanged: (rating) => onChanged(rating.round()),
            // Slider skips onChanged when the new value equals the one it was
            // built with. Unset, that is 1, so a tap on 1 would otherwise be
            // lost; onChangeEnd always reports where the interaction ended.
            onChangeEnd: (rating) => onChanged(rating.round()),
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 18),
          child: Row(
            children: [
              Text('1', style: ends),
              Expanded(
                child: rated
                    ? const SizedBox.shrink()
                    : Text(
                        'Slide to rate your day',
                        textAlign: TextAlign.center,
                        style: ends,
                      ),
              ),
              Text('10', style: ends),
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

/// A draft that can no longer be posted. Its words stay readable and
/// selectable until the author discards them.
class _UnpostedDraft extends StatelessWidget {
  const _UnpostedDraft({
    required this.icon,
    required this.title,
    required this.body,
    required this.draft,
    required this.discardLabel,
    required this.onDiscard,
  });

  final IconData icon;
  final String title;
  final String body;
  final DailyPostDraft? draft;
  final String discardLabel;
  final Future<void> Function() onDiscard;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final saved = draft;
    final words = saved == null
        ? const <(String, String)>[]
        : [
            ('Your answer', saved.reflectiveAnswer),
            ('Word dump', saved.caption),
            ("Note to tomorrow's you", saved.tomorrowNote),
          ].where((entry) => entry.$2.trim().isNotEmpty).toList();
    return _StateMessage(
      icon: icon,
      title: title,
      body: body,
      extra: words.isEmpty
          ? null
          : Container(
              key: const Key('composer.unpostedWords'),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: colors.card,
                borderRadius: BorderRadius.circular(14),
                boxShadow: DayliShadows.card,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final (index, (label, text)) in words.indexed) ...[
                    if (index > 0) const SizedBox(height: 14),
                    Text(
                      label,
                      style: DayliText.sans(
                        context,
                        size: DayliTextSize.sm,
                        weight: FontWeight.w500,
                        color: colors.foregroundTertiary,
                      ),
                    ),
                    const SizedBox(height: 4),
                    SelectableText(
                      text,
                      style: DayliText.sans(context, size: DayliTextSize.base),
                    ),
                  ],
                ],
              ),
            ),
      action: DayliButton(
        key: const Key('composer.discardDraft'),
        label: discardLabel,
        fullWidth: true,
        height: 52,
        onPressed: onDiscard,
      ),
    );
  }
}

/// Solo or friends, with nothing chosen until the author picks one.
class _AudiencePicker extends StatelessWidget {
  const _AudiencePicker({
    required this.value,
    required this.invalid,
    required this.onChanged,
  });

  final PostAudience? value;
  final bool invalid;
  final ValueChanged<PostAudience> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    Widget option(
      PostAudience audience,
      IconData icon,
      String title,
      String body,
    ) {
      final selected = value == audience;
      return Expanded(
        child: Semantics(
          button: true,
          inMutuallyExclusiveGroup: true,
          selected: selected,
          label: '$title. $body',
          excludeSemantics: true,
          child: Material(
            color: selected
                ? colors.foregroundAccent
                : colors.backgroundSecondary,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
              side: BorderSide(
                color: invalid ? colors.danger : Colors.transparent,
              ),
            ),
            child: InkWell(
              key: Key('composer.audience.${audience.wireValue}'),
              borderRadius: BorderRadius.circular(14),
              onTap: () => onChanged(audience),
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 88),
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(
                        icon,
                        size: 22,
                        color: selected ? Colors.white : colors.foreground,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        title,
                        style: DayliText.serif(
                          context,
                          size: DayliTextSize.lg,
                          weight: FontWeight.w600,
                          color: selected ? Colors.white : colors.foreground,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        body,
                        style: DayliText.sans(
                          context,
                          size: DayliTextSize.sm,
                          color: selected
                              ? Colors.white.withValues(alpha: 0.85)
                              : colors.foregroundSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    }

    // Both cards match the taller one's height.
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          option(
            PostAudience.friends,
            Icons.group_rounded,
            'Friends',
            'Your friends see it after midnight.',
          ),
          const SizedBox(width: 10),
          option(
            PostAudience.solo,
            Icons.lock_rounded,
            'Solo',
            'Only you can see it.',
          ),
        ],
      ),
    );
  }
}

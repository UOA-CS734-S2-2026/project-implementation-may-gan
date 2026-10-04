import 'package:flutter/material.dart';

import '../app/theme.dart';
import '../drafts/daily_post_draft.dart';
import '../ui/dayli_button.dart';
import '../ui/voice_player.dart';
import 'composer_controller.dart';
import 'media_input.dart';
import 'voice_memo_recorder.dart';

/// A plain-language reason for a server rejection of a voice memo.
String voiceMemoFailureMessage(String? reason) => switch (reason) {
  'format_mismatch' ||
  'malformed_container' => 'This recording looks damaged. Record it again.',
  'duration_exceeded' => 'Voice memos can be up to a minute long.',
  'byte_size_mismatch' ||
  'object_not_found' => "The upload didn't finish properly.",
  _ => "This voice memo couldn't be uploaded.",
};

/// The composer's voice memo: a record button, then while recording the time
/// and a live level meter, then the memo as a player with its upload state.
///
/// Recording only ever starts from [onRecord], which is the author tapping.
class VoiceMemoInput extends StatelessWidget {
  const VoiceMemoInput({
    super.key,
    required this.recorder,
    required this.memo,
    required this.state,
    required this.onRecord,
    required this.onRemove,
    required this.onOpenSettings,
    this.error,
  });

  final VoiceMemoRecorderController recorder;

  /// The draft's voice memo, or null.
  final DraftAttachment? memo;

  /// Where [memo] is in the upload.
  final MediaTileState state;
  final VoidCallback onRecord;
  final VoidCallback onRemove;
  final VoidCallback onOpenSettings;

  /// Why posting is held, when that is about the voice memo.
  final String? error;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: recorder,
      builder: (context, _) {
        final recording = recorder.isRecording || recorder.isBusy;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (recorder.isRecording)
              _RecordingCard(recorder: recorder)
            else if (memo != null)
              _MemoCard(
                memo: memo!,
                state: state,
                busy: recording,
                onRecord: onRecord,
                onRemove: onRemove,
              )
            else
              _RecordButton(busy: recording, onPressed: onRecord),
            _Message(
              recorder: recorder,
              error: error,
              onOpenSettings: onOpenSettings,
            ),
          ],
        );
      },
    );
  }
}

class _RecordButton extends StatelessWidget {
  const _RecordButton({required this.busy, required this.onPressed});

  final bool busy;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    return Semantics(
      button: true,
      enabled: !busy,
      label: 'Record a voice memo',
      excludeSemantics: true,
      child: Material(
        color: colors.backgroundSecondary,
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          key: const Key('composer.voiceMemo.record'),
          borderRadius: BorderRadius.circular(18),
          onTap: busy ? null : onPressed,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: colors.accent,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.mic_rounded,
                    color: Colors.white,
                    size: 24,
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Record a voice memo',
                        style: DayliText.serif(
                          context,
                          size: DayliTextSize.base,
                          weight: FontWeight.w600,
                        ),
                      ),
                      Text(
                        'Optional. Up to 1 minute. You can listen before '
                        'you post.',
                        key: const Key('composer.voiceMemo.hint'),
                        style: DayliText.sans(
                          context,
                          size: DayliTextSize.sm,
                          color: colors.foregroundTertiary,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _RecordingCard extends StatelessWidget {
  const _RecordingCard({required this.recorder});

  final VoiceMemoRecorderController recorder;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final tabular = DayliText.sans(
      context,
      size: DayliTextSize.lg,
      weight: FontWeight.w600,
    ).copyWith(fontFeatures: const [FontFeature.tabularFigures()]);
    // The newest levels sit at the right edge, like a sound scrolling past.
    final levels = recorder.levels;
    final padded = [
      ...List.filled(
        VoiceMemoRecorderController.liveLevels - levels.length,
        0.0,
      ),
      ...levels,
    ];

    return Container(
      key: const Key('composer.voiceMemo.recording'),
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
      decoration: BoxDecoration(
        color: colors.backgroundAccent,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: colors.danger.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(
                  color: colors.danger,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Recording',
                  style: DayliText.sans(
                    context,
                    size: DayliTextSize.sm,
                    weight: FontWeight.w500,
                    color: colors.danger,
                  ),
                ),
              ),
              Semantics(
                container: true,
                label:
                    'Recording time ${formatClock(recorder.elapsed)} of '
                    '${formatClock(DailyPostLimits.voiceMemoDurationMax)}',
                excludeSemantics: true,
                child: Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(
                        text: formatClock(recorder.elapsed),
                        style: tabular,
                      ),
                      TextSpan(
                        text:
                            ' / ${formatClock(DailyPostLimits.voiceMemoDurationMax)}',
                        style: tabular.copyWith(
                          color: colors.foregroundTertiary,
                          fontWeight: FontWeight.w400,
                        ),
                      ),
                    ],
                  ),
                  key: const Key('composer.voiceMemo.time'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: 44,
            child: WaveformBars(
              levels: padded,
              playedColor: colors.danger,
              restColor: colors.danger.withValues(alpha: 0.25),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              TextButton(
                key: const Key('composer.voiceMemo.cancel'),
                onPressed: recorder.cancel,
                child: const Text('Cancel'),
              ),
              const SizedBox(width: 8),
              DayliButton(
                key: const Key('composer.voiceMemo.stop'),
                label: 'Stop',
                weight: ButtonWeight.primary,
                color: ButtonColor.foreground,
                onPressed: recorder.stop,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MemoCard extends StatelessWidget {
  const _MemoCard({
    required this.memo,
    required this.state,
    required this.busy,
    required this.onRecord,
    required this.onRemove,
  });

  final DraftAttachment memo;
  final MediaTileState state;
  final bool busy;
  final VoidCallback onRecord;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final milliseconds = memo.durationMs;
    final (text, icon, color) = switch (state) {
      MediaTileState.done => (
        'Ready to post',
        Icons.check_circle_rounded,
        colors.success,
      ),
      MediaTileState.failed => (
        voiceMemoFailureMessage(memo.failureReason),
        Icons.error_outline_rounded,
        colors.danger,
      ),
      _ => ('Uploading…', null, colors.foregroundTertiary),
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        VoicePlayerPill.file(
          key: ValueKey(memo.localPath),
          path: memo.compressedPath ?? memo.localPath,
          waveform: memo.waveform,
          duration: milliseconds == null
              ? null
              : Duration(milliseconds: milliseconds),
          label: 'Your voice memo',
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            if (icon != null)
              Icon(icon, size: 18, color: color)
            else
              SizedBox(
                width: 14,
                height: 14,
                child: CircularProgressIndicator(strokeWidth: 2, color: color),
              ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                text,
                key: const Key('composer.voiceMemo.status'),
                style: DayliText.sans(
                  context,
                  size: DayliTextSize.sm,
                  color: color,
                ),
              ),
            ),
          ],
        ),
        Row(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            TextButton(
              key: const Key('composer.voiceMemo.rerecord'),
              onPressed: busy ? null : onRecord,
              child: const Text('Re-record'),
            ),
            TextButton(
              key: const Key('composer.voiceMemo.remove'),
              onPressed: busy ? null : onRemove,
              style: TextButton.styleFrom(foregroundColor: colors.danger),
              child: const Text('Remove'),
            ),
          ],
        ),
      ],
    );
  }
}

/// The line under the section: why nothing was recorded, with a way to the
/// system Settings when only they can help, or why posting is held.
class _Message extends StatelessWidget {
  const _Message({
    required this.recorder,
    required this.error,
    required this.onOpenSettings,
  });

  final VoiceMemoRecorderController recorder;
  final String? error;
  final VoidCallback onOpenSettings;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final notice = recorder.notice ?? error;
    final info = recorder.info;
    final text = notice ?? info;
    if (text == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Text(
              text,
              key: const Key('composer.voiceMemo.message'),
              style: DayliText.sans(
                context,
                size: DayliTextSize.sm,
                color: notice != null
                    ? colors.danger
                    : colors.foregroundTertiary,
              ),
            ),
          ),
          if (recorder.notice != null && recorder.settingsCanFix)
            TextButton(
              key: const Key('composer.voiceMemo.settings'),
              onPressed: onOpenSettings,
              child: const Text('Open Settings'),
            ),
        ],
      ),
    );
  }
}

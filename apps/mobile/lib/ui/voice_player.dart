import 'dart:async';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

import '../app/theme.dart';

/// `m:ss`, the way a voice memo's time is shown.
String formatClock(Duration duration) {
  final seconds = duration.inSeconds.clamp(0, 359999);
  return '${seconds ~/ 60}:${(seconds % 60).toString().padLeft(2, '0')}';
}

/// Bars for the loudness of a voice memo over time, with the part already
/// played drawn stronger than the rest.
class WaveformBars extends StatelessWidget {
  const WaveformBars({
    super.key,
    required this.levels,
    this.progress = 1,
    this.playedColor,
    this.restColor,
  });

  /// Each from 0 (silence) to 1.
  final List<double> levels;

  /// How much of the width counts as played, from 0 to 1.
  final double progress;
  final Color? playedColor;
  final Color? restColor;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    return CustomPaint(
      size: Size.infinite,
      painter: _BarsPainter(
        levels: levels,
        progress: progress,
        played: playedColor ?? colors.foregroundAccent,
        rest: restColor ?? colors.accent.withValues(alpha: 0.55),
      ),
    );
  }
}

/// The narrowest a bar is drawn, and the space between bars.
const _minBarWidth = 2.0;
const _barGap = 2.5;

/// [levels] cut down to as many bars as fit in [width], the loudest moment of
/// each slice kept so a peak is never lost. All of them when they fit.
List<double> fitLevels(List<double> levels, double width) {
  if (levels.isEmpty || width <= 0) return const [];
  final fit = max(1, ((width + _barGap) / (_minBarWidth + _barGap)).floor());
  if (levels.length <= fit) return levels;
  return [
    for (var bar = 0; bar < fit; bar++)
      levels
          .sublist(
            bar * levels.length ~/ fit,
            max(
              bar * levels.length ~/ fit + 1,
              (bar + 1) * levels.length ~/ fit,
            ),
          )
          .reduce(max),
  ];
}

class _BarsPainter extends CustomPainter {
  const _BarsPainter({
    required this.levels,
    required this.progress,
    required this.played,
    required this.rest,
  });

  final List<double> levels;
  final double progress;
  final Color played;
  final Color rest;

  static const _minimumBar = 3.0;

  @override
  void paint(Canvas canvas, Size size) {
    // Fewer bars when the space is tight, so none is drawn past the edge.
    final bars = fitLevels(levels, size.width);
    final count = bars.length;
    if (count == 0) return;
    final barWidth = (size.width - _barGap * (count - 1)) / count;
    final paint = Paint();
    for (var index = 0; index < count; index++) {
      // Quiet speech is drawn taller than its raw level, so it still reads.
      final level = pow(bars[index].clamp(0.0, 1.0), 0.6).toDouble();
      final height = max(_minimumBar, level * size.height);
      final left = index * (barWidth + _barGap);
      final center = (index + 0.5) / count;
      paint.color = center <= progress ? played : rest;
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromCenter(
            center: Offset(left + barWidth / 2, size.height / 2),
            width: barWidth,
            height: height,
          ),
          Radius.circular(barWidth / 2),
        ),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(_BarsPainter old) =>
      old.progress != progress ||
      old.levels != levels ||
      old.played != played ||
      old.rest != rest;
}

/// A plain progress bar with a thumb, for a memo with no waveform to draw.
class _ProgressTrack extends StatelessWidget {
  const _ProgressTrack({required this.progress});

  final double progress;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        final fill = (width * progress.clamp(0.0, 1.0)).toDouble();
        return Stack(
          alignment: Alignment.centerLeft,
          children: [
            Container(
              height: 6,
              decoration: BoxDecoration(
                color: colors.accent.withValues(alpha: 0.3),
                borderRadius: BorderRadius.circular(3),
              ),
            ),
            Container(
              width: fill,
              height: 6,
              decoration: BoxDecoration(
                color: colors.accent,
                borderRadius: BorderRadius.circular(3),
              ),
            ),
            Positioned(
              left: (fill - 7).clamp(0.0, max(0.0, width - 14)).toDouble(),
              child: Container(
                width: 14,
                height: 14,
                decoration: BoxDecoration(
                  color: Colors.white,
                  shape: BoxShape.circle,
                  border: Border.all(color: colors.accent, width: 2),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

/// A voice memo's player: a play button, a progress track, and the time, in a
/// pill like a message's voice note.
///
/// It never starts by itself and stops when the app leaves the foreground.
/// With [waveform] (the author's own memo) the track is the recording's
/// loudness; without it (a friend's) it is a progress bar.
class VoicePlayerPill extends StatefulWidget {
  const VoicePlayerPill.file({
    super.key,
    required String this._path,
    this.waveform,
    this.duration,
    this.label = 'Voice memo',
  }) : _url = null,
       onRefreshUrl = null;

  const VoicePlayerPill.network({
    super.key,
    required Uri this._url,
    this.onRefreshUrl,
    this.duration,
    this.label = 'Voice memo',
  }) : _path = null,
       waveform = null;

  final String? _path;
  final Uri? _url;

  /// The recording's loudness, 0 to 255 per bar.
  final List<int>? waveform;

  /// How long the memo is, when known before it loads.
  final Duration? duration;

  /// Called once when a private URL fails to load, to get a fresh one.
  final Future<Uri?> Function()? onRefreshUrl;
  final String label;

  @override
  State<VoicePlayerPill> createState() => _VoicePlayerPillState();
}

class _VoicePlayerPillState extends State<VoicePlayerPill>
    with WidgetsBindingObserver {
  VideoPlayerController? _player;
  Uri? _url;
  bool _loading = true;
  bool _failed = false;
  bool _refreshed = false;
  bool _finishing = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _url = widget._url;
    unawaited(_open());
  }

  @override
  void didUpdateWidget(VoicePlayerPill oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget._path != widget._path || oldWidget._url != widget._url) {
      _url = widget._url;
      _refreshed = false;
      unawaited(_open());
    }
  }

  Future<void> _open() async {
    final previous = _player;
    _player = null;
    previous?.removeListener(_onChanged);
    unawaited(previous?.dispose());
    setState(() {
      _loading = true;
      _failed = false;
    });
    final path = widget._path;
    final player = path != null
        ? VideoPlayerController.file(File(path))
        : VideoPlayerController.networkUrl(_url!);
    _player = player;
    player.addListener(_onChanged);
    try {
      await player.initialize();
    } catch (_) {
      if (_player == player) await _loadFailed();
      return;
    }
    if (!mounted || _player != player) return;
    await player.setLooping(false);
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _loadFailed() async {
    final refresh = widget.onRefreshUrl;
    if (refresh != null && !_refreshed) {
      _refreshed = true;
      final fresh = await refresh();
      if (!mounted) return;
      if (fresh != null) {
        _url = fresh;
        return _open();
      }
    }
    if (mounted) {
      setState(() {
        _loading = false;
        _failed = true;
      });
    }
  }

  void _onChanged() {
    final player = _player;
    if (player == null || !mounted) return;
    final value = player.value;
    if (value.hasError && !_failed && !_loading) {
      unawaited(_loadFailed());
      return;
    }
    if (value.isCompleted && !_finishing) {
      // Back to the start, ready to play again.
      _finishing = true;
      unawaited(
        player
            .pause()
            .then((_) => player.seekTo(Duration.zero))
            .whenComplete(() => _finishing = false),
      );
    }
    setState(() {});
  }

  Future<void> _toggle() async {
    final player = _player;
    if (player == null || _loading || _failed) return;
    if (player.value.isPlaying) {
      await player.pause();
      return;
    }
    final end = player.value.duration;
    if (end > Duration.zero && player.value.position >= end) {
      await player.seekTo(Duration.zero);
    }
    await player.play();
  }

  Future<void> _seekTo(double fraction) async {
    final player = _player;
    if (player == null || _loading || _failed) return;
    final end = player.value.duration;
    if (end <= Duration.zero) return;
    await player.seekTo(end * fraction.clamp(0.0, 1.0));
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) unawaited(_player?.pause());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _player?.removeListener(_onChanged);
    unawaited(_player?.dispose());
    super.dispose();
  }

  Duration get _total {
    final loaded = _player?.value.duration ?? Duration.zero;
    return loaded > Duration.zero ? loaded : (widget.duration ?? Duration.zero);
  }

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    if (_failed) return _Unavailable(semanticLabel: widget.label);

    final value = _player?.value;
    final total = _total;
    final position = value?.position ?? Duration.zero;
    final playing = value?.isPlaying ?? false;
    final progress = total > Duration.zero
        ? (position.inMilliseconds / total.inMilliseconds).clamp(0.0, 1.0)
        : 0.0;
    final peaks = widget.waveform;

    final clock = DayliText.sans(
      context,
      size: DayliTextSize.sm,
      weight: FontWeight.w500,
      color: colors.foregroundAccent,
    ).copyWith(fontFeatures: const [FontFeature.tabularFigures()]);

    final track = peaks != null && peaks.isNotEmpty
        ? WaveformBars(
            levels: [for (final peak in peaks) peak / 255],
            progress: progress,
          )
        : _ProgressTrack(progress: progress);

    return Semantics(
      container: true,
      // The play button stays its own control, not folded into this label.
      explicitChildNodes: true,
      label: widget.label,
      value: '${formatClock(position)} of ${formatClock(total)}',
      child: Container(
        key: const Key('voicePlayer'),
        constraints: const BoxConstraints(minHeight: 56),
        padding: const EdgeInsets.fromLTRB(8, 8, 16, 8),
        decoration: BoxDecoration(
          color: colors.backgroundAccent,
          borderRadius: BorderRadius.circular(28),
          border: Border.all(color: colors.accent.withValues(alpha: 0.25)),
        ),
        child: Row(
          children: [
            _PlayButton(
              loading: _loading,
              playing: playing,
              label: playing ? 'Pause ${widget.label}' : 'Play ${widget.label}',
              onPressed: _toggle,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: LayoutBuilder(
                builder: (context, constraints) => GestureDetector(
                  key: const Key('voicePlayer.track'),
                  behavior: HitTestBehavior.opaque,
                  onTapDown: (details) =>
                      _seekTo(details.localPosition.dx / constraints.maxWidth),
                  onHorizontalDragUpdate: (details) =>
                      _seekTo(details.localPosition.dx / constraints.maxWidth),
                  child: SizedBox(height: 32, child: track),
                ),
              ),
            ),
            const SizedBox(width: 12),
            Text(
              total > Duration.zero
                  ? '${formatClock(position)} / ${formatClock(total)}'
                  : '–:––',
              key: const Key('voicePlayer.time'),
              style: clock,
            ),
          ],
        ),
      ),
    );
  }
}

class _PlayButton extends StatelessWidget {
  const _PlayButton({
    required this.loading,
    required this.playing,
    required this.label,
    required this.onPressed,
  });

  final bool loading;
  final bool playing;
  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    return Semantics(
      button: true,
      enabled: !loading,
      label: label,
      excludeSemantics: true,
      child: Material(
        color: colors.accent,
        shape: const CircleBorder(),
        child: InkWell(
          key: const Key('voicePlayer.toggle'),
          customBorder: const CircleBorder(),
          onTap: loading ? null : onPressed,
          child: SizedBox(
            width: 40,
            height: 40,
            child: Center(
              child: loading
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : Icon(
                      playing ? Icons.pause_rounded : Icons.play_arrow_rounded,
                      color: Colors.white,
                      size: 26,
                    ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Unavailable extends StatelessWidget {
  const _Unavailable({required this.semanticLabel});

  /// Read by screen readers, such as "Friend's voice memo".
  final String semanticLabel;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    return Semantics(
      container: true,
      label: '$semanticLabel unavailable',
      excludeSemantics: true,
      child: Container(
        key: const Key('voicePlayer.unavailable'),
        constraints: const BoxConstraints(minHeight: 56),
        padding: const EdgeInsets.symmetric(horizontal: 16),
        decoration: BoxDecoration(
          color: colors.backgroundSecondary,
          borderRadius: BorderRadius.circular(28),
        ),
        child: Row(
          children: [
            Icon(Icons.mic_off_outlined, color: colors.foregroundTertiary),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                'Voice memo unavailable',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: DayliText.sans(
                  context,
                  size: DayliTextSize.sm,
                  color: colors.foregroundTertiary,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

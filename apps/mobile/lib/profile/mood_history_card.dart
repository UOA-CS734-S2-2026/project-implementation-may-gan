import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../api/api_failure.dart';
import '../api/profile_client.dart';
import '../app/theme.dart';
import '../ui/dayli_button.dart';
import '../ui/surfaces.dart';

const _months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', //
  'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec',
];

/// Calendar days since 1970-01-01; `YYYY-MM-DD` carries no zone, so UTC is exact.
int _dayNumber(String date) =>
    DateTime.parse('${date}T00:00:00Z').millisecondsSinceEpoch ~/
    Duration.millisecondsPerDay;

/// Dates as the web app writes them: "02 Oct 2026", or "2 Oct" when [short].
String formatMoodDate(String date, {bool short = false}) {
  final parsed = DateTime.parse(date);
  final month = _months[parsed.month - 1];
  return short
      ? '${parsed.day} $month'
      : '${parsed.day.toString().padLeft(2, '0')} $month ${parsed.year}';
}

/// A profile's ratings over time, in the style of the web app's mood
/// section. It reaches the same people as the profile's posts: the owner and
/// their friends. It describes what was posted and makes no claim about why;
/// gaps and sample sizes stay visible.
class MoodHistoryCard extends StatefulWidget {
  const MoodHistoryCard({
    super.key,
    required this.profiles,
    required this.username,
    required this.displayName,
    required this.isMe,
    this.refreshCount = 0,
  });

  final ProfileClient profiles;
  final String username;
  final String displayName;
  final bool isMe;

  /// Reloads whenever this changes, such as on pull to refresh.
  final int refreshCount;

  @override
  State<MoodHistoryCard> createState() => _MoodHistoryCardState();
}

class _MoodHistoryCardState extends State<MoodHistoryCard> {
  MoodRange _range = MoodRange.days30;
  MoodHistory? _history;
  ApiFailure? _failure;
  bool _loading = true;
  int _request = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant MoodHistoryCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.refreshCount != widget.refreshCount ||
        oldWidget.profiles != widget.profiles ||
        oldWidget.username != widget.username) {
      _load();
    }
  }

  Future<void> _load() async {
    final request = ++_request;
    final range = _range;
    setState(() => _loading = true);
    final result = await widget.profiles.moodHistory(widget.username, range);
    // A newer range or refresh has started since.
    if (!mounted || request != _request) return;
    setState(() {
      _loading = false;
      switch (result) {
        case ApiSuccess(:final value):
          _history = value;
          _failure = null;
        case ApiError(:final failure):
          _failure = failure;
      }
    });
  }

  void _select(MoodRange range) {
    if (range == _range) return;
    setState(() => _range = range);
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final history = _history;
    final period = history?.current;
    final audience = widget.isMe
        ? 'You and your friends can see this.'
        : "Only ${widget.displayName}'s friends can see this.";
    return Padding(
      padding: const EdgeInsets.only(top: 20),
      child: DayliCard(
        key: const Key('profile.mood'),
        padding: const EdgeInsets.all(24),
        radius: 22,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Mood',
              style: DayliText.sans(
                context,
                size: DayliTextSize.lg,
                weight: FontWeight.w600,
                tracking: DayliTracking.tight,
              ),
            ),
            Text(
              period == null
                  ? audience
                  : '${formatMoodDate(period.from)} to ${formatMoodDate(period.to)} · $audience',
              style: DayliText.sans(
                context,
                size: DayliTextSize.xs,
                color: colors.foregroundSecondary,
              ),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final range in MoodRange.values)
                  Semantics(
                    selected: range == _range,
                    child: DayliButton(
                      key: Key('profile.mood.${range.wire}'),
                      label: range.label,
                      size: ButtonSize.sm,
                      weight: range == _range
                          ? ButtonWeight.primary
                          : ButtonWeight.secondary,
                      onPressed: () => _select(range),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 16),
            if (history == null && _loading)
              const Center(child: CircularProgressIndicator())
            else if (history == null)
              Text(
                _failure is NetworkUnavailable
                    ? "You're offline, so this mood history couldn't be loaded."
                    : "This mood history couldn't be loaded. Try again later.",
                key: const Key('profile.mood.error'),
                style: DayliText.sans(
                  context,
                  size: DayliTextSize.sm,
                  color: colors.foregroundSecondary,
                ),
              )
            else
              AnimatedOpacity(
                opacity: _loading ? 0.6 : 1,
                duration: const Duration(milliseconds: 150),
                child: _MoodBody(
                  history: history,
                  range: _range,
                  owner: widget.isMe ? null : widget.displayName,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _MoodBody extends StatelessWidget {
  const _MoodBody({required this.history, required this.range, this.owner});

  final MoodHistory history;
  final MoodRange range;

  /// The profile's public name, or null on your own profile.
  final String? owner;

  String _plural(int count, String one) =>
      '$count ${count == 1 ? one : '${one}s'}';

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final current = history.current;
    final previous = history.previous;
    final change = current.average != null && previous.average != null
        ? ((current.average! - previous.average!) * 10).round() / 10
        : null;
    final joinedInRange = history.trackedFrom.compareTo(current.from) > 0;

    Widget stat(String key, String value, String label, String detail) =>
        Semantics(
          key: Key('profile.mood.$key'),
          container: true,
          label: '$value $label, $detail',
          excludeSemantics: true,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minWidth: 88),
            child: Column(
              children: [
                Text(
                  value,
                  style: DayliText.sans(
                    context,
                    size: DayliTextSize.xl,
                    weight: FontWeight.w700,
                  ),
                ),
                Text(
                  label,
                  textAlign: TextAlign.center,
                  style: DayliText.sans(
                    context,
                    size: DayliTextSize.xs,
                    color: colors.foregroundSecondary,
                  ),
                ),
                Text(
                  detail,
                  textAlign: TextAlign.center,
                  style: DayliText.sans(
                    context,
                    fontSize: 11,
                    color: colors.foregroundTertiary,
                  ),
                ),
              ],
            ),
          ),
        );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          decoration: BoxDecoration(
            color: colors.backgroundSecondary,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Wrap(
            alignment: WrapAlignment.center,
            spacing: 24,
            runSpacing: 12,
            children: [
              stat(
                'average',
                current.average?.toStringAsFixed(1) ?? '–',
                'Average rating',
                current.postedDays == 0
                    ? 'No posts yet'
                    : 'From ${_plural(current.postedDays, 'post')}',
              ),
              stat(
                'change',
                change == null
                    ? '–'
                    : '${change > 0
                          ? '+'
                          : change < 0
                          ? '−'
                          : '±'}${change.abs().toStringAsFixed(1)}',
                'vs the ${range.period} before',
                previous.postedDays == 0
                    ? 'No posts then'
                    : '${previous.average!.toStringAsFixed(1)} from ${_plural(previous.postedDays, 'post')}',
              ),
              stat(
                'missing',
                '${current.missingDays}',
                'Days without a post',
                joinedInRange
                    ? 'Of ${_plural(current.trackedDays, 'day')} since ${owner == null ? 'you' : 'they'} joined'
                    : 'Of ${_plural(current.trackedDays, 'day')}',
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        if (history.days.isEmpty)
          Text(
            owner == null
                ? 'Post a dayli and your rating will show up here.'
                : 'No ratings to show in this range yet.',
            style: DayliText.sans(
              context,
              size: DayliTextSize.sm,
              color: colors.foregroundTertiary,
            ),
          )
        else
          MoodChart(
            from: current.from,
            to: current.to,
            trackedFrom: history.trackedFrom,
            days: history.days,
            hiddenDays: history.hiddenDays,
          ),
        if (joinedInRange) ...[
          const SizedBox(height: 12),
          Text(
            "${owner ?? 'You'} joined on ${formatMoodDate(history.trackedFrom)}, so earlier days aren't counted as missing.",
            style: DayliText.sans(
              context,
              size: DayliTextSize.xs,
              color: colors.foregroundTertiary,
            ),
          ),
        ],
      ],
    );
  }
}

/// Daily ratings over a fixed window. The line only joins consecutive days,
/// so a missed day shows as a gap rather than an invented value. Tap or drag
/// to read a day.
class MoodChart extends StatefulWidget {
  const MoodChart({
    super.key,
    required this.from,
    required this.to,
    required this.trackedFrom,
    required this.days,
    this.hiddenDays = const [],
  });

  final String from;
  final String to;
  final String trackedFrom;
  final List<MoodDay> days;

  /// Days with a post the viewer can't see. They are neither rated nor missing.
  final List<String> hiddenDays;

  @override
  State<MoodChart> createState() => _MoodChartState();
}

class _MoodChartState extends State<MoodChart> {
  static const _plotHeight = 160.0;
  static const _axisWidth = 28.0;
  static const _tooltipHeight = 30.0;
  int? _active;

  int get _start => _dayNumber(widget.from);
  int get _span => math.max(1, _dayNumber(widget.to) - _start);

  double _x(MoodDay day) => (_dayNumber(day.localDate) - _start) / _span;

  void _pick(double dx, double width) {
    if (widget.days.isEmpty || width <= 0) return;
    final fraction = (dx / width).clamp(0.0, 1.0);
    var best = 0;
    for (var index = 1; index < widget.days.length; index++) {
      if ((_x(widget.days[index]) - fraction).abs() <
          (_x(widget.days[best]) - fraction).abs()) {
        best = index;
      }
    }
    if (best != _active) setState(() => _active = best);
  }

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final active = _active == null ? null : widget.days[_active!];
    final ratings = widget.days.map((day) => day.rating).toList();
    final average = ratings.isEmpty
        ? null
        : ratings.reduce((a, b) => a + b) / ratings.length;
    return Semantics(
      key: const Key('profile.mood.chart'),
      label:
          'Daily ratings from ${formatMoodDate(widget.from)} to ${formatMoodDate(widget.to)}: '
          '${widget.days.length} posted days'
          '${average == null ? '' : ', averaging ${average.toStringAsFixed(1)}'}.',
      child: Column(
        children: [
          SizedBox(
            height: _tooltipHeight,
            child: LayoutBuilder(
              builder: (context, constraints) {
                if (active == null) return const SizedBox.shrink();
                final plotWidth = constraints.maxWidth - _axisWidth - 8;
                final x = _axisWidth + _x(active) * plotWidth;
                return Stack(
                  children: [
                    Positioned(
                      left: x,
                      bottom: 6,
                      child: FractionalTranslation(
                        translation: Offset(
                          _x(active) > 0.75
                              ? -1
                              : _x(active) < 0.25
                              ? 0
                              : -0.5,
                          0,
                        ),
                        child: Container(
                          key: const Key('profile.mood.tooltip'),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: colors.backgroundAccent,
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            '${formatMoodDate(active.localDate)}: Rating of ${active.rating}',
                            style: DayliText.sans(
                              context,
                              fontSize: 11,
                              color: colors.foregroundAccent,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
          LayoutBuilder(
            builder: (context, constraints) {
              final plotWidth = constraints.maxWidth - _axisWidth - 8;
              return GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTapDown: (details) =>
                    _pick(details.localPosition.dx - _axisWidth, plotWidth),
                onHorizontalDragUpdate: (details) =>
                    _pick(details.localPosition.dx - _axisWidth, plotWidth),
                child: CustomPaint(
                  size: Size(constraints.maxWidth, _plotHeight),
                  painter: _MoodPainter(
                    start: _start,
                    span: _span,
                    trackedFrom: _dayNumber(widget.trackedFrom),
                    to: _dayNumber(widget.to),
                    days: widget.days,
                    hiddenDays: {
                      for (final day in widget.hiddenDays) _dayNumber(day),
                    },
                    active: _active,
                    colors: colors,
                    labelStyle: DayliText.sans(
                      context,
                      fontSize: 11,
                      color: colors.foreground.withValues(alpha: 0.5),
                    ),
                    axisWidth: _axisWidth,
                  ),
                ),
              );
            },
          ),
          const SizedBox(height: 10),
          Padding(
            padding: const EdgeInsets.only(left: _axisWidth, right: 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                for (final date in [widget.from, widget.to])
                  Text(
                    formatMoodDate(date, short: true),
                    style: DayliText.sans(
                      context,
                      fontSize: 11,
                      color: colors.foreground.withValues(alpha: 0.6),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MoodPainter extends CustomPainter {
  _MoodPainter({
    required this.start,
    required this.span,
    required this.trackedFrom,
    required this.to,
    required this.days,
    required this.hiddenDays,
    required this.active,
    required this.colors,
    required this.labelStyle,
    required this.axisWidth,
  });

  static const ticks = [1, 4, 7, 10];
  final int start;
  final int span;
  final int trackedFrom;
  final int to;
  final List<MoodDay> days;
  final Set<int> hiddenDays;
  final int? active;
  final DayliColors colors;
  final TextStyle labelStyle;
  final double axisWidth;

  @override
  void paint(Canvas canvas, Size size) {
    final left = axisWidth;
    final width = size.width - axisWidth - 8;
    final height = size.height;
    double x(int day) => left + (day - start) / span * width;
    double y(int rating) => (10 - rating) / 9 * height;

    final grid = Paint()
      ..color = colors.foreground.withValues(alpha: 0.1)
      ..strokeWidth = 1;
    for (final tick in ticks) {
      canvas.drawLine(
        Offset(left, y(tick)),
        Offset(left + width, y(tick)),
        grid,
      );
      final label = TextPainter(
        text: TextSpan(text: '$tick', style: labelStyle),
        textDirection: TextDirection.ltr,
      )..layout();
      label.paint(
        canvas,
        Offset(left - 8 - label.width, y(tick) - label.height / 2),
      );
    }

    final points = [
      for (final day in days)
        (day: _dayNumber(day.localDate), rating: day.rating),
    ];
    final posted = {for (final point in points) point.day};
    final dense = span > 90;

    // As on web, a tracked day without any post gets an empty circle on the
    // baseline. Today is still open, so it never gets one.
    if (!dense) {
      final ring = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1
        ..color = colors.foreground.withValues(alpha: 0.3);
      final fill = Paint()..color = colors.background;
      for (var day = math.max(start, trackedFrom); day < to; day++) {
        if (posted.contains(day) || hiddenDays.contains(day)) continue;
        canvas.drawCircle(Offset(x(day), y(1)), 4, fill);
        canvas.drawCircle(Offset(x(day), y(1)), 4, ring);
      }
    }

    if (active != null) {
      canvas.drawLine(
        Offset(x(points[active!].day), 0),
        Offset(x(points[active!].day), height),
        Paint()
          ..color = colors.foreground.withValues(alpha: 0.3)
          ..strokeWidth = 1,
      );
    }

    final line = Paint()
      ..color = colors.accent
      ..strokeWidth = 3
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    for (var index = 1; index < points.length; index++) {
      final before = points[index - 1];
      final point = points[index];
      if (point.day != before.day + 1) continue;
      canvas.drawLine(
        Offset(x(before.day), y(before.rating)),
        Offset(x(point.day), y(point.rating)),
        line,
      );
    }

    final dot = Paint()..color = colors.foregroundAccent;
    final ring = Paint()..color = colors.card;
    for (var index = 0; index < points.length; index++) {
      final point = points[index];
      final lone =
          !posted.contains(point.day - 1) && !posted.contains(point.day + 1);
      if (dense && !lone && index != active) continue;
      final radius = index == active ? 6.0 : 4.0;
      final centre = Offset(x(point.day), y(point.rating));
      canvas.drawCircle(centre, radius + 2, ring);
      canvas.drawCircle(centre, radius, dot);
    }
  }

  @override
  bool shouldRepaint(covariant _MoodPainter old) =>
      old.days != days ||
      old.active != active ||
      old.colors != colors ||
      old.span != span ||
      old.start != start;
}

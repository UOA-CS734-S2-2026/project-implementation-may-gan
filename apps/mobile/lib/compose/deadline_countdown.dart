import 'dart:async';

import 'package:flutter/material.dart';

import '../app/theme.dart';

/// Counts down to the server's posting deadline, corrected for device clock
/// skew. Styled as WDCC's PostDeadlineCountdown.
class DeadlineCountdown extends StatefulWidget {
  const DeadlineCountdown({
    super.key,
    required this.deadlineAt,
    required this.serverNow,
    this.clock = DateTime.now,
  });

  final DateTime deadlineAt;
  final DateTime serverNow;
  final DateTime Function() clock;

  @override
  State<DeadlineCountdown> createState() => _DeadlineCountdownState();
}

class _DeadlineCountdownState extends State<DeadlineCountdown> {
  late Duration _skew;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _skew = widget.serverNow.difference(widget.clock());
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => setState(() {}));
  }

  @override
  void didUpdateWidget(DeadlineCountdown oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.serverNow != widget.serverNow) {
      _skew = widget.serverNow.difference(widget.clock());
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    var remaining = widget.deadlineAt.difference(widget.clock().add(_skew));
    if (remaining.isNegative) remaining = Duration.zero;
    String two(int value) => value.toString().padLeft(2, '0');
    final parts = [
      (two(remaining.inHours), 'hours'),
      (two(remaining.inMinutes.remainder(60)), 'mins'),
      (two(remaining.inSeconds.remainder(60)), 'secs'),
    ];
    final colors = DayliColors.of(context);
    final digits = DayliText.serif(
      context,
      size: DayliTextSize.lg,
      weight: FontWeight.w600,
      tracking: DayliTracking.tight,
      color: colors.foregroundAccent,
    );
    final colon = DayliText.serif(
      context,
      size: DayliTextSize.lg,
      weight: FontWeight.w600,
      color: colors.foregroundSecondary,
    ).copyWith(height: 1);
    final unit = DayliText.serif(
      context,
      size: DayliTextSize.sm,
      color: colors.foregroundSecondary,
    );

    // WDCC's PostDeadlineCountdown markup.
    return Semantics(
      label:
          'Time left to post: ${remaining.inHours} hours '
          '${remaining.inMinutes.remainder(60)} minutes',
      excludeSemantics: true,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final (index, (value, label)) in parts.indexed) ...[
            if (index > 0)
              SizedBox(
                height: 48,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(8, 0, 8, 24),
                  child: Center(child: Text(':', style: colon)),
                ),
              ),
            Column(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: colors.backgroundAccent,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(value, style: digits),
                ),
                const SizedBox(height: 4),
                Text(label, style: unit),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

import 'dart:async';

import 'package:flutter/material.dart';

import '../app/theme.dart';

/// Counts down to the server's posting deadline, corrected for device clock
/// skew, like the web app's countdown.
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
    final serif = Theme.of(context).textTheme.titleLarge;

    return Semantics(
      label:
          'Time left to post: ${remaining.inHours} hours '
          '${remaining.inMinutes.remainder(60)} minutes',
      excludeSemantics: true,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final (index, (value, unit)) in parts.indexed) ...[
            if (index > 0)
              Padding(
                padding: const EdgeInsets.only(bottom: 18, left: 4, right: 4),
                child: Text(
                  ':',
                  style: serif?.copyWith(color: colors.foregroundSecondary),
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
                  child: Text(
                    value,
                    style: serif?.copyWith(
                      fontSize: 18,
                      color: colors.foregroundAccent,
                    ),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  unit,
                  style: TextStyle(
                    fontSize: 12,
                    color: colors.foregroundSecondary,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

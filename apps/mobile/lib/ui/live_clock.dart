import 'dart:async';

import 'package:flutter/material.dart';

import '../app/theme.dart';

/// WDCC's `LiveClock`: the device time as `h:mm am`.
class LiveClock extends StatefulWidget {
  const LiveClock({super.key, this.clock = DateTime.now});

  final DateTime Function() clock;

  @override
  State<LiveClock> createState() => _LiveClockState();
}

class _LiveClockState extends State<LiveClock> {
  late final Timer _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => setState(() {}));
  }

  @override
  void dispose() {
    _timer.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final now = widget.clock();
    final hour = now.hour % 12 == 0 ? 12 : now.hour % 12;
    final minute = now.minute.toString().padLeft(2, '0');
    final period = now.hour < 12 ? 'am' : 'pm';
    return Text(
      '$hour:$minute $period',
      style: DayliText.serif(
        context,
        size: DayliTextSize.sm,
        tracking: DayliTracking.tight,
      ),
    );
  }
}

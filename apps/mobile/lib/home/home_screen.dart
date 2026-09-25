import 'dart:math';

import 'package:flutter/material.dart';

import '../app/theme.dart';

/// WDCC's home feed. The released friends feed arrives with #19 (and #20 on
/// mobile); until then the feed is empty and shows WDCC's empty state.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, this.random});

  final Random? random;

  static const emptyMessages = [
    "No daylies from your friends yesterday... maybe today's the comeback?",
    'Nobody posted anything yesterday... how about today?',
    "There was radio silence yesterday... maybe we'll get some daylies today?",
    "The archive is looking a bit thin for yesterday. There's always today.",
    "Yesterday's daylies are looking a little light. Maybe everyone was busy?",
    "Silence is golden, but a dayli is better. Let's write today.",
    "Well, nothing yesterday. The bar for today's dayli is on the floor - it's on you!",
    'No posts from yesterday. How boring...',
    'An empty feed. Did you know you can add new friends by searching for their username?',
    'A day without a dayli is just... a day. Hopefully today\'s a bit better.',
    "Yesterday's pages are blank. Let's write today's chapter.",
    'Yesterday was just you, me, and the void between us.',
    "A quiet yesterday just leaves space for a big today :)",
    'Nobody posted yesterday. Find better friends ong fr.',
    "Your friends didn't post any daylies yesterday. Are they hiding something from you?",
    "Your friends were being nonchalant yesterday. There's always today!",
  ];

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late final String _emptyMessage =
      HomeScreen.emptyMessages[(widget.random ?? Random()).nextInt(
        HomeScreen.emptyMessages.length,
      )];

  // WDCC: `py-12` on the section and `py-64` on the empty state.
  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.fromLTRB(16, 48 + 256, 16, 48 + 256),
    children: [
      Text(
        _emptyMessage,
        key: const Key('home.empty'),
        textAlign: TextAlign.center,
        style: DayliText.serif(
          context,
          size: DayliTextSize.lg,
          weight: FontWeight.w500,
          tracking: DayliTracking.tight,
          color: DayliColors.of(context).foregroundSecondary,
        ),
      ),
    ],
  );
}

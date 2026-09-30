import 'package:flutter/material.dart';

import '../api/profile_client.dart';
import '../app/theme.dart';

String _days(int count) => '$count ${count == 1 ? 'day' : 'days'}';

/// Confirmed streak values from the server. A missed day just shows the
/// longest streak; nothing here nudges anyone to post.
class ProfileStreakLine extends StatelessWidget {
  const ProfileStreakLine({
    super.key,
    required this.streak,
    required this.isMe,
  });

  final PostingStreak streak;
  final bool isMe;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final style = DayliText.sans(
      context,
      size: DayliTextSize.sm,
      color: colors.foregroundSecondary,
    );
    final String text;
    if (streak.longest == 0) {
      if (!isMe) return const SizedBox.shrink();
      text = 'Your streak starts with your first dayli.';
    } else {
      text = [
        if (streak.current > 0) '${_days(streak.current)} in a row',
        'Longest: ${_days(streak.longest)}',
        if (isMe && streak.postedToday) "Today's dayli is in.",
      ].join(' · ');
    }
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Text(
        text,
        key: const Key('profile.streak'),
        textAlign: TextAlign.center,
        style: style,
      ),
    );
  }
}

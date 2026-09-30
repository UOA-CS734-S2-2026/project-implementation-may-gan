import 'package:flutter/material.dart';

import '../api/profile_client.dart';
import '../app/theme.dart';

/// The original web app's streak colour (Tailwind orange-500).
const _streakOrange = Color(0xFFF97316);

/// Posts, friends, and the day streak, laid out as in the original web app.
/// Confirmed server values only; nothing here nudges anyone to post.
class ProfileStatsTile extends StatelessWidget {
  const ProfileStatsTile({
    super.key,
    required this.stats,
    required this.streak,
    this.onFriends,
  });

  final ProfileStats stats;
  final PostingStreak streak;

  /// Opens the friends list; only the owner gets one.
  final VoidCallback? onFriends;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    Widget stat(String key, int value, String label, {Color? color}) =>
        Semantics(
          key: Key('profile.stats.$key'),
          container: true,
          label: '$value $label',
          excludeSemantics: true,
          child: Column(
            children: [
              Text(
                '$value',
                style: DayliText.sans(
                  context,
                  size: DayliTextSize.xl,
                  weight: FontWeight.w700,
                  color: color,
                ),
              ),
              Text(
                label,
                style: DayliText.sans(
                  context,
                  size: DayliTextSize.xs,
                  color: colors.foregroundSecondary,
                ),
              ),
            ],
          ),
        );
    final friends = stat(
      'friends',
      stats.friends,
      stats.friends == 1 ? 'Friend' : 'Friends',
    );
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 16),
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
          stat('posts', stats.posts, stats.posts == 1 ? 'Post' : 'Posts'),
          if (onFriends == null)
            friends
          else
            GestureDetector(onTap: onFriends, child: friends),
          stat('streak', streak.current, 'Day streak', color: _streakOrange),
        ],
      ),
    );
  }
}
